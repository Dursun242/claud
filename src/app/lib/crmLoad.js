// Lecture de tout le CRM en une fois, avec un client Supabase fourni :
// navigateur (lib/crmDb.loadCrm, RLS) ou serveur (mail du matin,
// /api/cron/daily-digest, client service role). Sans dépendance au client
// du navigateur, importable côté serveur.
//
// Tables : crm_opportunites, crm_interactions (migration 025),
//          crm_devis (migration 027), crm_devis_events (030, facultative).

// Code Postgres « relation does not exist » : migration 025 pas appliquée.
const MISSING_TABLE = '42P01'
export const isMissingTable = (err) =>
  !!err && (err.code === MISSING_TABLE || /does not exist/i.test(err.message || ''))

const EVENTS_COLS = 'devis_id, kind, created_at'
async function loadDevisEvents(sb) {
  const q = (cols) => sb.from('crm_devis_events').select(cols).order('created_at', { ascending: false }).limit(3000)
  const ev = await q(`${EVENTS_COLS}, detail`)
  // Migration 041 absente : colonne detail inconnue → suivi sans les réponses
  return ev?.error && /detail/i.test(ev.error.message || '') ? q(EVENTS_COLS) : ev
}

/**
 * Volume attendu : quelques centaines de lignes max pour une maîtrise d'œuvre.
 * `devisMissing` = migration 027 absente (la section Devis est masquée).
 * @returns {{ opportunites: Array, interactions: Array, devis: Array, devisEvents: Array,
 *             missingMigration: boolean, devisMissing: boolean }}
 */
export async function loadCrmWith(sb) {
  const [opp, inter, dev, ev] = await Promise.all([
    sb.from('crm_opportunites').select('*').order('updated_at', { ascending: false }),
    sb.from('crm_interactions').select('*').order('date', { ascending: false }).limit(1000),
    sb.from('crm_devis').select('*').order('created_at', { ascending: false }).limit(1000),
    // Suivi des ouvertures / consultations (migration 030, facultative) et
    // relances / réponses du client (detail : migration 041)
    loadDevisEvents(sb),
  ])
  if (opp.error) {
    if (isMissingTable(opp.error)) {
      return { opportunites: [], interactions: [], devis: [], devisEvents: [], missingMigration: true, devisMissing: true }
    }
    throw new Error('Erreur chargement CRM : ' + opp.error.message)
  }
  return {
    opportunites: opp.data || [],
    interactions: inter.error ? [] : (inter.data || []),
    devis: dev?.error ? [] : (dev?.data || []),
    devisEvents: ev?.error ? [] : (ev?.data || []),
    missingMigration: false,
    devisMissing: !!(dev?.error && isMissingTable(dev.error)),
  }
}
