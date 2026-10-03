// Route /api/entreprises — recherche d'entreprises françaises dans
// l'Annuaire des entreprises de l'État (recherche-entreprises.api.gouv.fr :
// gratuit, sans clé, données INSEE / RNE). Remplace Pappers (payant).
//   ?siret=<14 chiffres> → l'entreprise (adresse de cet établissement)
//   ?q=<texte>           → { resultats, dirigeants } (nom d'entreprise ou de dirigeant)
// Auth obligatoire (verifyAuth) ; réponse au format de lib/entreprises.

import { verifyAuth } from '@/app/lib/auth'
import { fetchWithRetry } from '@/app/lib/fetchWithRetry'
import { createLogger } from '@/app/lib/logger'
import { ANNUAIRE_URL, normalizeEntreprise, splitSearchResults } from '@/app/lib/entreprises'

const log = createLogger('entreprises')

async function annuaire(params) {
  const res = await fetchWithRetry(`${ANNUAIRE_URL}?${new URLSearchParams(params).toString()}`, {
    timeoutMs: 12000,
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    log.error(`annuaire ${res.status}`, errText.slice(0, 300))
    const error = res.status === 429
      ? 'Annuaire des entreprises très sollicité : réessaie dans quelques secondes.'
      : "L'annuaire des entreprises ne répond pas, réessaie plus tard."
    return { error, status: res.status === 429 ? 429 : 502 }
  }
  return { data: await res.json().catch(() => ({})) }
}

export async function GET(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const siret = (searchParams.get('siret') || '').replace(/\s/g, '')
    const q = (searchParams.get('q') || '').trim()

    if (siret) {
      if (!/^\d{14}$/.test(siret)) return Response.json({ error: 'SIRET invalide (14 chiffres)' }, { status: 400 })
      const { data, error, status } = await annuaire({ q: siret, per_page: '1' })
      if (error) return Response.json({ error }, { status })
      const ent = normalizeEntreprise((data.results || [])[0], siret)
      if (!ent) return Response.json({ error: 'Aucune entreprise trouvée pour ce SIRET.' }, { status: 404 })
      return Response.json(ent)
    }

    if (q) {
      if (q.length < 3) return Response.json({ error: 'Tape au moins 3 caractères.' }, { status: 400 })
      const { data, error, status } = await annuaire({ q, per_page: '10', etat_administratif: 'A' })
      if (error) return Response.json({ error }, { status })
      return Response.json(splitSearchResults(data.results || [], q))
    }

    return Response.json({ error: "Paramètre 'siret' ou 'q' requis" }, { status: 400 })
  } catch (error) {
    log.error('exception', error?.message || error)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
