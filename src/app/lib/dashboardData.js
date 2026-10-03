// Mise en forme du dataset du tableau de bord de l'équipe à partir des
// lignes Supabase brutes : champs camelCase (chantierId…), lots par défaut,
// chantiers de démo écartés avec tout ce qui leur est rattaché.
// Logique pure, partagée par le navigateur (SB.loadCritical /
// SB.loadSecondary, dashboards/shared.js) et le serveur (mail du matin,
// /api/cron/daily-digest) pour que les deux voient les mêmes données.

// Chantiers de démo (seed_demo_data, migrations 015-016). Le flag is_demo
// est filtré dans la requête ; ces identifiants servent de secours si la
// migration 016 manque, et à écarter les tâches, OS, CR, phases et
// rendez-vous de ces chantiers.
export const DEMO_CHANTIER_IDS = new Set([
  '11111111-1111-4111-8111-111111111d01',
  '22222222-2222-4222-8222-222222222d02',
  '33333333-3333-4333-8333-333333333d03',
])

// Filtre Supabase des chantiers hors démo (à passer à .or())
export const NOT_DEMO_FILTER = 'is_demo.is.null,is_demo.eq.false'

export const isDemoChantier = (c) => c?.is_demo === true || DEMO_CHANTIER_IDS.has(c?.id)

const notDemoWith = (demoIds) => (item) => !item?.chantier_id
  || (!demoIds.has(item.chantier_id) && !DEMO_CHANTIER_IDS.has(item.chantier_id))

/**
 * Étape 1 (chantiers, tâches, CR, OS).
 * @returns {{ chantiers, tasks, compteRendus, ordresService, _demoIds: Set }}
 */
export function mapCriticalData({ chantiers = [], taches = [], compteRendus = [], ordresService = [] } = {}) {
  const rows = chantiers || []
  const demoIds = new Set(rows.filter(isDemoChantier).map(c => c.id))
  const notDemo = notDemoWith(demoIds)
  return {
    chantiers: rows.filter(c => !isDemoChantier(c)).map(c => ({ ...c, lots: c.lots || [] })),
    tasks: (taches || []).filter(notDemo).map(t => ({ ...t, chantierId: t.chantier_id })),
    compteRendus: (compteRendus || []).filter(notDemo).map(c => ({ ...c, chantierId: c.chantier_id })),
    ordresService: (ordresService || []).filter(notDemo),
    _demoIds: demoIds,
  }
}

/**
 * Étape 2 (contacts, planning, rendez-vous, liens contact ↔ chantier).
 * `attachmentCounts` : lignes de la RPC chantier_attachment_counts (ou null).
 */
export function mapSecondaryData({ contacts = [], planning = [], rdv = [], contactChantiers = [], attachmentCounts = null } = {}, demoIds = new Set()) {
  const notDemo = notDemoWith(demoIds)
  const attachmentCountsByChantier = new Map()
  if (Array.isArray(attachmentCounts)) {
    for (const row of attachmentCounts) {
      if (row.chantier_id && notDemo(row)) attachmentCountsByChantier.set(row.chantier_id, row.n)
    }
  }
  return {
    contacts: contacts || [],
    planning: (planning || []).filter(notDemo).map(p => ({ ...p, chantierId: p.chantier_id })),
    rdv: (rdv || []).filter(notDemo).map(r => ({
      ...r, chantierId: r.chantier_id, participants: r.participants || [],
    })),
    attachmentCountsByChantier,
    contactChantiers: (contactChantiers || []).filter(notDemo),
  }
}
