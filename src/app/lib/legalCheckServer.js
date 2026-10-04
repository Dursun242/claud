// Contrôle légal des entreprises — accès serveur : interrogation de
// l'annuaire des entreprises et du BODACC, enregistrement du résultat
// (contact_legal_checks), alerte de l'équipe si la situation se dégrade.
// Utilisé par /api/conformite (« Vérifier maintenant ») et
// /api/cron/conformite (contrôle quotidien des entreprises suivies).

import { fetchWithRetry } from './fetchWithRetry'
import { ANNUAIRE_URL } from './entreprises'
import { BODACC_URL, parseAnnuaire, parseBodacc, legalStatus, sirenOfSiret, worsened } from './legalCheck'
import { smtpConfig, sendMail } from './mailer'

export const LEGAL_MIGRATION_MSG = 'Contrôle légal non activé : appliquer la migration 039 dans Supabase.'
const missingTable = (err) => err && (err.code === '42P01' || /does not exist|schema cache/i.test(err.message || ''))

async function getJson(url, log, source) {
  try {
    const res = await fetchWithRetry(url, { timeoutMs: 12000, maxRetries: 1, headers: { Accept: 'application/json' } })
    if (!res.ok) { log?.warn(`${source} ${res.status}`, (await res.text().catch(() => '')).slice(0, 200)); return null }
    return await res.json()
  } catch (e) {
    log?.warn(`${source} injoignable`, e?.message || e)
    return null
  }
}

/** Interroge les deux sources pour un SIREN → synthèse legalStatus. */
export async function fetchLegalStatus(siren, log) {
  if (!siren) return legalStatus({ siren: '' })
  const [a, b] = await Promise.all([
    getJson(`${ANNUAIRE_URL}?${new URLSearchParams({ q: siren, per_page: '5' })}`, log, 'annuaire'),
    getJson(`${BODACC_URL}?${new URLSearchParams({ where: `"${siren}"`, order_by: 'dateparution desc', limit: '50' })}`, log, 'bodacc'),
  ])
  return legalStatus({ siren, annuaire: a ? parseAnnuaire(a, siren) : null, bodacc: b ? parseBodacc(b, siren) : null })
}

/**
 * Contrôle une entreprise et enregistre le résultat. Prévient l'équipe
 * (cloche + mail) si la situation devient « alerte » ou « critique ».
 * @returns {{ data } | { error, status }}
 */
export async function checkCompany(admin, contact, log) {
  const siren = sirenOfSiret(contact.siret)
  const { data: previous, error: readErr } = await admin.from('contact_legal_checks').select('*').eq('contact_id', contact.id).maybeSingle()
  if (readErr && missingTable(readErr)) return { error: LEGAL_MIGRATION_MSG, status: 503 }
  const result = await fetchLegalStatus(siren, log)
  const row = { contact_id: contact.id, siren: siren || null, statut: result.statut, libelle: result.libelle, details: result.details, checked_at: new Date().toISOString() }
  const { error } = await admin.from('contact_legal_checks').upsert(row, { onConflict: 'contact_id' })
  if (error) {
    if (missingTable(error)) return { error: LEGAL_MIGRATION_MSG, status: 503 }
    log?.error('enregistrement du contrôle légal', error.message)
    return { error: 'Enregistrement impossible.', status: 500 }
  }
  if (worsened(previous?.statut, row.statut)) await notifyLegal(admin, contact, row, log)
  return { data: row }
}

async function notifyLegal(admin, contact, row, log) {
  const title = `⚠ ${contact.societe || contact.nom} : ${row.statut === 'critique' ? 'entreprise fermée ou en liquidation' : 'procédure collective'}`
  try {
    const { data: staff } = await admin.from('authorized_users').select('email, role, actif')
    const emails = [...new Set((staff || [])
      .filter(u => u.actif === true && ['admin', 'salarie', 'salarié'].includes(u.role) && u.email)
      .map(u => String(u.email).trim().toLowerCase()))]
    if (emails.length) {
      const { error } = await admin.from('notifications').insert(emails.map(recipient_email => ({
        recipient_email, actor_email: null, kind: 'update', entity_type: 'contact', entity_id: contact.id,
        chantier_id: null, title, body: row.libelle, target_tab: 'contacts',
      })))
      if (error) log?.warn('notification contrôle légal', error.message)
    }
    const cfg = smtpConfig()
    if (cfg) {
      await sendMail(cfg, {
        to: cfg.notify,
        subject: title,
        text: [
          `${contact.societe || contact.nom}${row.siren ? ` (SIREN ${row.siren})` : ''}`,
          row.libelle, '',
          'Vérifiez la situation avant de poursuivre ou de payer cette entreprise (fiche Contacts → Documents).',
          'Sources : annuaire des entreprises (recherche-entreprises.api.gouv.fr) et BODACC (bodacc.fr).',
        ].join('\n'),
      })
    }
  } catch (e) { log?.warn('alerte contrôle légal', e?.message || e) }
}

/** Entreprises à contrôler en priorité : jamais contrôlées, puis le contrôle le plus ancien. */
export function checkOrder(contacts = [], checks = [], max = 30) {
  const last = new Map(checks.map(c => [c.contact_id, String(c.checked_at || '')]))
  return [...contacts].sort((a, b) => (last.get(a.id) || '').localeCompare(last.get(b.id) || '')).slice(0, max)
}
