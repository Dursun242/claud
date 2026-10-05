// Route /api/devis/track — image de suivi (1×1) des mails de devis.
//
// SANS authentification : l'image est chargée par la messagerie du client.
// Le jeton (64 hex, propre au devis, crm_devis.track_token) identifie le
// devis ; une « ouverture » est enregistrée (migration 030). Répond
// toujours l'image, même si le jeton est inconnu. `&r=1` : image du mail de
// relance (ouverture marquée detail.relance, migration 041).

import { createLogger } from '@/app/lib/logger'
import { createRateLimiter } from '@/app/lib/rateLimit'
import { adminClient } from '@/app/lib/supabaseClients'
import { isTrackToken, recordDevisEvent } from '@/app/lib/devisTracking'

const log = createLogger('devis-track')
const checkRate = createRateLimiter({ limit: 60, windowMs: 60_000 })
// GIF transparent 1×1
const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

const pixel = () => new Response(PIXEL_GIF, {
  status: 200,
  headers: {
    'Content-Type': 'image/gif',
    'Content-Length': String(PIXEL_GIF.length),
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
  },
})

export async function GET(request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    if (!checkRate(ip || 'unknown')) return pixel()
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('t')
    if (!isTrackToken(token)) return pixel()
    const admin = adminClient()
    const { data: devis } = await admin.from('crm_devis').select('id').eq('track_token', token).maybeSingle()
    if (devis?.id) {
      await recordDevisEvent(admin, devis.id, 'ouverture', {
        ip, userAgent: request.headers.get('user-agent'), log,
        ...(searchParams.get('r') === '1' ? { detail: { relance: true } } : {}),
      })
    }
  } catch (err) {
    log.warn('exception', err?.message || err)
  }
  return pixel()
}
