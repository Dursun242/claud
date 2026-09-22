// Logique pure de la vue « Ma journée » (DashboardV).
// Aucune dépendance React / Supabase → testable directement.
//
// Rassemble, à partir du dataset du dashboard, ce qui demande une action
// aujourd'hui : RDV du jour, tâches en retard ou dues aujourd'hui, OS en
// attente de signature, phases de planning qui démarrent ou se terminent,
// relances CRM. Chaque entrée porte l'onglet cible + l'id à focaliser pour
// que le clic amène directement au bon élément.

// Statuts de signature Odoo qui attendent encore une action (cf. lib/odoo.js)
export const PENDING_SIGNATURE = ['Envoyé', 'Partiellement signé']

// Date locale au format AAAA-MM-JJ (pas toISOString : décalage UTC le soir)
export function localISO(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  return localISO(new Date(y, m - 1, d + n))
}

const day = (v) => (v ? String(v).slice(0, 10) : '')

/**
 * @param {object} data   dataset dashboard (chantiers, tasks, ordresService, planning, rdv)
 * @param {object} [opts]
 * @param {string} [opts.today]      AAAA-MM-JJ (défaut : aujourd'hui, heure locale)
 * @param {Array}  [opts.relances]   interactions CRM à traiter (déjà filtrées)
 * @param {number} [opts.horizon=7]  nb de jours pour « à venir »
 */
export function buildAgenda(data = {}, { today = localISO(), relances = [], horizon = 7 } = {}) {
  const chantierById = new Map((data.chantiers || []).map(c => [c.id, c]))
  const chantierNom = (id) => chantierById.get(id)?.nom || ''
  const limit = addDaysISO(today, horizon)

  const rdvToday = (data.rdv || [])
    .filter(r => day(r.date) === today)
    .sort((a, b) => String(a.heure || '').localeCompare(String(b.heure || '')))
    .map(r => ({
      id: r.id, kind: 'rdv', title: r.titre || 'Rendez-vous',
      sub: [r.heure, r.lieu, chantierNom(r.chantierId || r.chantier_id)].filter(Boolean).join(' · '),
      tab: 'planning', focus: null,
    }))

  const rdvUpcoming = (data.rdv || [])
    .filter(r => day(r.date) > today && day(r.date) <= limit)
    .sort((a, b) => (day(a.date) + (a.heure || '')).localeCompare(day(b.date) + (b.heure || '')))
    .map(r => ({
      id: r.id, kind: 'rdv', title: r.titre || 'Rendez-vous', date: day(r.date),
      sub: [r.heure, r.lieu, chantierNom(r.chantierId || r.chantier_id)].filter(Boolean).join(' · '),
      tab: 'planning', focus: null,
    }))

  const openTasks = (data.tasks || []).filter(t => t.statut !== 'Terminé' && t.echeance)
  const tasksOverdue = openTasks
    .filter(t => day(t.echeance) < today)
    .sort((a, b) => day(a.echeance).localeCompare(day(b.echeance)))
    .map(t => ({
      id: t.id, kind: 'task', title: t.titre, date: day(t.echeance), late: true,
      sub: chantierNom(t.chantierId || t.chantier_id), tab: 'tasks', focus: t.id,
    }))
  const tasksToday = openTasks
    .filter(t => day(t.echeance) === today)
    .map(t => ({
      id: t.id, kind: 'task', title: t.titre, date: today,
      sub: chantierNom(t.chantierId || t.chantier_id), tab: 'tasks', focus: t.id,
    }))

  const osToSign = (data.ordresService || [])
    .filter(o => PENDING_SIGNATURE.includes(o.statut_signature))
    .map(o => ({
      id: o.id, kind: 'os', title: `${o.numero || 'OS'} — ${o.artisan_nom || 'artisan'}`,
      sub: [o.statut_signature, o.chantier || chantierNom(o.chantier_id)].filter(Boolean).join(' · '),
      tab: 'os', focus: o.id,
    }))

  // Phases de planning qui démarrent ou se terminent aujourd'hui, et
  // phases dont la fin est dépassée alors qu'elles ne sont pas à 100 %.
  const phases = []
  for (const p of data.planning || []) {
    const debut = day(p.debut), fin = day(p.fin)
    const avancement = Number(p.avancement) || 0
    let note = null
    if (debut === today) note = 'Démarre aujourd\'hui'
    else if (fin === today) note = 'Se termine aujourd\'hui'
    else if (fin && fin < today && avancement < 100) note = `En retard · ${avancement} %`
    if (!note) continue
    phases.push({
      id: p.id, kind: 'planning', title: [p.lot, p.tache].filter(Boolean).join(' — ') || 'Phase',
      sub: [note, chantierNom(p.chantierId || p.chantier_id)].filter(Boolean).join(' · '),
      late: note.startsWith('En retard'), tab: 'planning', focus: null,
    })
  }

  const count = rdvToday.length + tasksOverdue.length + tasksToday.length
    + osToSign.length + phases.length + relances.length

  return { today, rdvToday, rdvUpcoming, tasksOverdue, tasksToday, osToSign, phases, relances, count }
}

/**
 * Vue maître d'ouvrage : prochaines étapes sur ses chantiers.
 * Phases en cours (avec avancement), prochaines phases, dernier CR, OS à signer.
 */
export function buildClientOverview(data = {}, { today = localISO(), horizon = 30 } = {}) {
  const chantierById = new Map((data.chantiers || []).map(c => [c.id, c]))
  const chantierNom = (id) => chantierById.get(id)?.nom || ''
  const limit = addDaysISO(today, horizon)
  const planning = data.planning || []

  const enCours = planning
    .filter(p => day(p.debut) <= today && day(p.fin) >= today)
    .sort((a, b) => day(a.fin).localeCompare(day(b.fin)))
    .map(p => ({
      id: p.id, title: [p.lot, p.tache].filter(Boolean).join(' — ') || 'Phase',
      avancement: Math.max(0, Math.min(100, Number(p.avancement) || 0)),
      fin: day(p.fin), chantier: chantierNom(p.chantierId || p.chantier_id),
    }))

  const aVenir = planning
    .filter(p => day(p.debut) > today && day(p.debut) <= limit)
    .sort((a, b) => day(a.debut).localeCompare(day(b.debut)))
    .map(p => ({
      id: p.id, title: [p.lot, p.tache].filter(Boolean).join(' — ') || 'Phase',
      debut: day(p.debut), chantier: chantierNom(p.chantierId || p.chantier_id),
    }))

  const dernierCR = [...(data.compteRendus || [])]
    .sort((a, b) => day(b.date).localeCompare(day(a.date)))[0] || null

  const osToSign = (data.ordresService || [])
    .filter(o => PENDING_SIGNATURE.includes(o.statut_signature))

  return {
    enCours, aVenir, osToSign,
    dernierCR: dernierCR && {
      id: dernierCR.id, numero: dernierCR.numero, date: day(dernierCR.date),
      resume: dernierCR.resume || '', chantier: chantierNom(dernierCR.chantierId || dernierCR.chantier_id),
    },
  }
}
