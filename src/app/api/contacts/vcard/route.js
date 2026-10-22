// Route /api/contacts/vcard — enregistrer un contact de l'annuaire dans les
// contacts du téléphone (fiche .vcf).
//   POST (staff, verifyStaff) → { exp, sig } : clé signée valable 2 heures,
//     qui sert à construire les liens des fiches (hooks/useVcardLinks.js).
//   GET ?id&exp&sig → fiche vCard (text/vcard, inline). Ouverte par un vrai
//     lien (nouvel onglet) : sur iPhone, Safari affiche la fiche avec
//     « Créer un contact », y compris depuis l'app installée sur l'écran
//     d'accueil ; un ordinateur télécharge le fichier .vcf.
// Le GET est ouvert par une simple navigation (pas d'en-tête Authorization
// possible) : l'accès repose sur la signature HMAC et son heure
// d'expiration, délivrées à l'équipe seulement.

import { createHmac, timingSafeEqual } from 'crypto'
import { verifyStaff } from '@/app/lib/auth'
import { createLogger } from '@/app/lib/logger'
import { adminClient } from '@/app/lib/supabaseClients'
import { contactVCard, vcardFileName } from '@/app/lib/vcard'

const log = createLogger('contacts-vcard')
const UUID_RE = /^[0-9a-f-]{36}$/i
const KEY_SECONDS = 2 * 60 * 60
const fail = (error, status = 400) => Response.json({ error }, { status })

function sign(exp) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant côté serveur')
  const key = createHmac('sha256', secret).update('contacts-vcard').digest()
  return createHmac('sha256', key).update(String(exp)).digest('base64url')
}

function validSignature(exp, sig) {
  const expected = Buffer.from(sign(exp))
  const given = Buffer.from(String(sig || ''))
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export async function POST(request) {
  try {
    const { user, status } = await verifyStaff(request)
    if (!user) return fail(status === 403 ? 'Réservé à l’équipe' : 'Non autorisé', status)
    const exp = Math.floor(Date.now() / 1000) + KEY_SECONDS
    return Response.json({ exp, sig: sign(exp) })
  } catch (err) {
    log.error('clé vCard', err)
    return fail('Fiche contact indisponible', 500)
  }
}

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams
    const id = String(params.get('id') || '')
    const exp = Number(params.get('exp'))
    if (!UUID_RE.test(id) || !Number.isInteger(exp)) return fail('Lien invalide')
    if (!validSignature(exp, params.get('sig'))) return fail('Lien invalide', 403)
    if (exp < Math.floor(Date.now() / 1000)) return fail('Lien expiré : rechargez la page Contacts de l’application.', 410)
    const { data: contact, error } = await adminClient().from('contacts').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    if (!contact) return fail('Contact introuvable', 404)
    return new Response(contactVCard(contact), {
      status: 200,
      headers: {
        'Content-Type': 'text/vcard; charset=utf-8',
        'Content-Disposition': `inline; filename="${vcardFileName(contact)}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    log.error('fiche vCard', err)
    return fail('Fiche contact indisponible', 500)
  }
}
