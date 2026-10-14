// Réponses des entreprises à leurs actions, côté serveur (service role) :
// liens sans compte (table cr_liens, migration 046), enregistrement d'une
// réponse sur la tâche, photo déposée dans les documents du chantier.
// Logique pure dans lib/crReponse.js.

import { newSignToken } from './devisSignature'
import { addDaysISO } from './today'
import { LIEN_JOURS, sameEntreprise, isLienToken } from './crReponse'

export const MIGRATION_MSG = 'Les réponses des entreprises demandent la migration 046 (Supabase).'
export const isMissingTable = (err) => !!err && (err.code === '42P01' || err.code === 'PGRST205' || err.code === '42703'
  || /does not exist|schema cache/i.test(err.message || ''))

/**
 * Lien de réponse d'une entreprise sur un chantier : le lien encore valable
 * est réutilisé (les mails précédents restent utilisables) et prolongé.
 * @returns {Promise<string>} jeton
 */
export async function ensureLien(admin, { chantierId, crId = null, entreprise, nom = '', email = '', today }) {
  const expire = addDaysISO(today, LIEN_JOURS)
  const { data: liens, error } = await admin.from('cr_liens').select('token, entreprise, expire_le')
    .eq('chantier_id', chantierId).gte('expire_le', today)
  if (error) throw error
  const found = (liens || []).find(l => sameEntreprise(l.entreprise, entreprise))
  if (found) {
    const patch = { expire_le: expire, ...(crId ? { cr_id: crId } : {}), ...(email ? { email } : {}), ...(nom ? { nom } : {}) }
    const { error: uErr } = await admin.from('cr_liens').update(patch).eq('token', found.token)
    if (uErr) throw uErr
    return found.token
  }
  const token = newSignToken()
  const { error: iErr } = await admin.from('cr_liens').insert({
    token, chantier_id: chantierId, cr_id: crId, entreprise, nom: nom || null, email: email || null, expire_le: expire,
  })
  if (iErr) throw iErr
  return token
}

/** Lien valable + chantier, ou { error, status }. */
export async function findLien(admin, token, today) {
  if (!isLienToken(token)) return { error: 'Lien invalide.', status: 404 }
  const { data: lien, error } = await admin.from('cr_liens').select('*').eq('token', token).maybeSingle()
  if (error) return isMissingTable(error) ? { error: MIGRATION_MSG, status: 503 } : { error: 'Lien indisponible.', status: 503 }
  if (!lien) return { error: 'Lien invalide.', status: 404 }
  if (String(lien.expire_le).slice(0, 10) < today) return { error: 'Ce lien a expiré : demandez-en un nouveau à votre interlocuteur.', status: 410 }
  const { data: chantier } = await admin.from('chantiers').select('id, nom, adresse, statut').eq('id', lien.chantier_id).maybeSingle()
  if (!chantier) return { error: 'Lien invalide.', status: 404 }
  return { lien, chantier }
}

/** Tâches du chantier (lecture service role). */
export async function chantierTasks(admin, chantierId) {
  const { data, error } = await admin.from('taches').select('*').eq('chantier_id', chantierId)
  if (error) throw error
  return data || []
}

/** Photo (data URL JPEG / PNG, déjà réduite par la page) → documents du chantier. */
export async function savePhoto(admin, { chantierId, dataUrl, entreprise }) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''))
  if (!m) return { error: 'Photo illisible.' }
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length > 3 * 1024 * 1024) return { error: 'Photo trop lourde (3 Mo au plus).' }
  const ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg'
  const path = `chantier/${chantierId}/reponse-${Date.now()}.${ext}`
  const { error } = await admin.storage.from('attachments').upload(path, buf, { contentType: m[1] })
  if (error) return { error: 'Envoi de la photo impossible.' }
  await admin.from('attachments').insert({
    chantier_id: chantierId, file_name: `Photo ${entreprise}.${ext}`.slice(0, 120), file_path: path, file_size: buf.length,
  })
  return { path }
}
