/**
 * Suivi des devis envoyés (migration 030) : ouvertures du mail (image de
 * suivi 1×1) et consultations du lien de signature en ligne.
 * Écriture serveur (service role) dans crm_devis_events ; lecture staff.
 * Sans dépendance Node : summarizeDevisEvents sert aussi côté navigateur.
 */

export const EVENT_KINDS = ['ouverture', 'consultation', 'pdf', 'relance', 'reponse']
// Répétitions rapprochées (rechargement, pré-chargement) comptées une fois
const DEDUP_MS = 2 * 60_000

export const isTrackToken = (t) => typeof t === 'string' && /^[a-f0-9]{64}$/.test(t)

/**
 * Enregistre un événement (sans jamais échouer : le suivi ne doit pas gêner
 * l'affichage). Ignoré si le même événement a été noté il y a moins de 2 min,
 * sauf `dedup: false` (relance, réponse du client). `detail` : migration 041.
 */
export async function recordDevisEvent(admin, devisId, kind, { ip = null, userAgent = null, detail = null, dedup = true, log } = {}) {
  if (!devisId || !EVENT_KINDS.includes(kind)) return false
  try {
    if (dedup) {
      const since = new Date(Date.now() - DEDUP_MS).toISOString()
      let q = admin.from('crm_devis_events')
        .select('id').eq('devis_id', devisId).eq('kind', kind).gte('created_at', since)
      // Ouverture de la relance : comptée à part de celle du premier mail
      if (detail?.relance) q = q.eq('detail->>relance', 'true')
      const { data: recent } = await q.limit(1)
      if (recent?.length) return false
    }
    const { error } = await admin.from('crm_devis_events').insert({
      devis_id: devisId, kind, ip: ip ? String(ip).slice(0, 64) : null,
      user_agent: userAgent ? String(userAgent).slice(0, 300) : null,
      ...(detail ? { detail } : {}),
    })
    if (error) { log?.warn('suivi devis', error.message); return false }
    return true
  } catch (e) {
    log?.warn('suivi devis', e?.message || e)
    return false
  }
}

/**
 * Résumé par devis : { [devisId]: { ouvertures, consultations, derniereOuverture,
 * derniereConsultation, relances, derniereRelance, relanceOuvertures,
 * derniereRelanceOuverture, reponses: [{ raison, commentaire, created_at }],
 * events: [{ kind, created_at, relance? }] } } (plus récents d'abord).
 * Une ouverture marquée detail.relance (image du mail de relance) est comptée
 * dans relanceOuvertures, pas dans ouvertures (premier mail).
 */
export function summarizeDevisEvents(events = []) {
  const out = {}
  const sorted = [...events].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  for (const e of sorted) {
    if (!e?.devis_id) continue
    const s = out[e.devis_id] || (out[e.devis_id] = {
      ouvertures: 0, consultations: 0, derniereOuverture: null, derniereConsultation: null,
      relances: 0, derniereRelance: null, relanceOuvertures: 0, derniereRelanceOuverture: null, reponses: [], events: [],
    })
    const ouvRelance = e.kind === 'ouverture' && !!e.detail?.relance
    s.events.push({ kind: e.kind, created_at: e.created_at, ...(ouvRelance ? { relance: true } : {}) })
    if (ouvRelance) {
      s.relanceOuvertures++
      s.derniereRelanceOuverture = s.derniereRelanceOuverture || e.created_at
    } else if (e.kind === 'relance') {
      s.relances++
      s.derniereRelance = s.derniereRelance || e.created_at
    } else if (e.kind === 'reponse') {
      if (e.detail?.raison) s.reponses.push({ raison: e.detail.raison, commentaire: e.detail.commentaire || '', created_at: e.created_at })
    } else if (e.kind === 'ouverture') {
      s.ouvertures++
      s.derniereOuverture = s.derniereOuverture || e.created_at
    } else {
      s.consultations++
      s.derniereConsultation = s.derniereConsultation || e.created_at
    }
  }
  return out
}
