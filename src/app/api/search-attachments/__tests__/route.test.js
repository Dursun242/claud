/**
 * @jest-environment node
 */
// Tests de la route /api/search-attachments.
//
// Vérifie : auth, early-return si q vide, requête ilike, jointure chantier,
// déduction du type (PDF / Image / Tableau / Document / Archive / Fichier).

jest.mock('@/app/lib/auth', () => ({
  verifyAuth: jest.fn(),
}))

jest.mock('@/app/lib/supabaseClients', () => ({
  userClientFromToken: jest.fn(),
  extractBearerToken: jest.fn(),
  adminClient: jest.fn(),
}))

jest.mock('@/app/lib/logger', () => ({
  createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
}))

// eslint-disable-next-line import/first
import { GET } from '../route'
// eslint-disable-next-line import/first
import { verifyAuth } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { userClientFromToken, extractBearerToken } from '@/app/lib/supabaseClients'

// Factory d'un faux client Supabase. La route fait deux requêtes :
//   1) attachments : .from().select().ilike().[eq()?].order().limit()
//   2) chantiers   : .from().select().in()   (terminal, résout direct)
// On expose des contrôleurs séparés pour chacune pour pouvoir router
// selon `table` (le 1er argument de .from()).
function makeSupaStub({ attachments = [], chantiers = [], error = null } = {}) {
  // Chain pour attachments : ilike → order → limit (terminal Promise)
  const attChain = {
    select: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnValue(Promise.resolve({ data: attachments, error })),
  }
  // Chain pour chantiers : in() est terminal
  const chChain = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnValue(Promise.resolve({ data: chantiers, error: null })),
  }
  const fromSpy = jest.fn((table) => {
    if (table === 'attachments') return attChain
    if (table === 'chantiers') return chChain
    throw new Error(`unexpected table: ${table}`)
  })
  return { from: fromSpy, _att: attChain, _ch: chChain }
}

function makeRequest(url, { token } = {}) {
  const headers = new Map()
  if (token) headers.set('authorization', `Bearer ${token}`)
  return {
    url,
    headers: { get: (n) => headers.get(n.toLowerCase()) ?? null },
  }
}

beforeEach(() => {
  verifyAuth.mockReset()
  userClientFromToken.mockReset()
  extractBearerToken.mockReset()
})

describe('GET /api/search-attachments', () => {
  it('renvoie 401 si verifyAuth échoue', async () => {
    verifyAuth.mockResolvedValue(null)

    const res = await GET(makeRequest('http://x/api/search-attachments?q=plan'))
    expect(res.status).toBe(401)
  })

  it('renvoie une liste vide quand q est absent (pas de requête DB)', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })

    const res = await GET(makeRequest('http://x/api/search-attachments', { token: 't' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.results).toEqual([])
    // userClientFromToken ne doit même pas être appelé (optimisation)
    expect(userClientFromToken).not.toHaveBeenCalled()
  })

  it('renvoie 401 si le Bearer token est absent mais q présent', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    extractBearerToken.mockReturnValue(null)

    const res = await GET(makeRequest('http://x/api/search-attachments?q=plan'))
    expect(res.status).toBe(401)
  })

  it('renvoie les résultats enrichis avec le nom du chantier et le type de fichier', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    extractBearerToken.mockReturnValue('tok')
    const attachments = [
      { id: 'a1', chantier_id: 'c1', file_name: 'plan.pdf',     file_size: 1024, created_at: '2026-01-01', file_path: 'x/plan.pdf' },
      { id: 'a2', chantier_id: 'c1', file_name: 'photo.JPG',    file_size: 500,  created_at: '2026-01-02', file_path: 'x/photo.JPG' },
      { id: 'a3', chantier_id: 'c2', file_name: 'budget.xlsx',  file_size: 200,  created_at: '2026-01-03', file_path: 'x/budget.xlsx' },
      { id: 'a4', chantier_id: null, file_name: 'notes.docx',   file_size: 100,  created_at: '2026-01-04', file_path: 'x/notes.docx' },
      { id: 'a5', chantier_id: 'c1', file_name: 'archives.zip', file_size: 999,  created_at: '2026-01-05', file_path: 'x/archives.zip' },
      { id: 'a6', chantier_id: 'c1', file_name: 'readme',       file_size: 50,   created_at: '2026-01-06', file_path: 'x/readme' },
    ]
    const chantiers = [
      { id: 'c1', nom: 'Villa A' },
      { id: 'c2', nom: 'Villa B' },
    ]
    const supa = makeSupaStub({ attachments, chantiers })
    userClientFromToken.mockReturnValue(supa)

    const res = await GET(makeRequest('http://x/api/search-attachments?q=plan', { token: 'tok' }))
    expect(res.status).toBe(200)
    const json = await res.json()

    // Filtre ilike passé tel quel à Supabase (la route normalise q en lowercase
    // puis wrappe en %..%).
    expect(supa._att.ilike).toHaveBeenCalledWith('file_name', '%plan%')

    expect(json.count).toBe(6)
    const [a1, a2, a3, a4, a5, a6] = json.results
    expect(a1).toMatchObject({ file_name: 'plan.pdf',    type: 'PDF',      chantier_nom: 'Villa A' })
    expect(a2).toMatchObject({ file_name: 'photo.JPG',   type: 'Image',    chantier_nom: 'Villa A' })
    expect(a3).toMatchObject({ file_name: 'budget.xlsx', type: 'Tableau',  chantier_nom: 'Villa B' })
    expect(a4).toMatchObject({ file_name: 'notes.docx',  type: 'Document', chantier_nom: '—' })
    expect(a5).toMatchObject({ file_name: 'archives.zip', type: 'Archive', chantier_nom: 'Villa A' })
    expect(a6).toMatchObject({ file_name: 'readme',      type: 'Fichier',  chantier_nom: 'Villa A' })
  })

  it('restreint la recherche à un chantier si chantierId est fourni', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    extractBearerToken.mockReturnValue('tok')
    const supa = makeSupaStub({ attachments: [], chantiers: [] })
    userClientFromToken.mockReturnValue(supa)

    await GET(makeRequest('http://x/api/search-attachments?q=x&chantierId=abc', { token: 'tok' }))
    expect(supa._att.eq).toHaveBeenCalledWith('chantier_id', 'abc')
  })

  it('renvoie 500 si la requête attachments échoue', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    extractBearerToken.mockReturnValue('tok')
    const supa = makeSupaStub({ error: { message: 'DB error' } })
    userClientFromToken.mockReturnValue(supa)

    const res = await GET(makeRequest('http://x/api/search-attachments?q=x', { token: 'tok' }))
    expect(res.status).toBe(500)
  })

  it("trim et lowercase la query côté serveur", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    extractBearerToken.mockReturnValue('tok')
    const supa = makeSupaStub({ attachments: [], chantiers: [] })
    userClientFromToken.mockReturnValue(supa)

    await GET(makeRequest('http://x/api/search-attachments?q=%20%20PLAN%20%20', { token: 'tok' }))
    // Les %20 sont l'encodage URL des espaces. La route fait .trim().toLowerCase()
    // → on s'attend à "plan" (et pas "  PLAN  ").
    expect(supa._att.ilike).toHaveBeenCalledWith('file_name', '%plan%')
  })
})
