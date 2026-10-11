// Bandeau « en un coup d'œil » de la fiche chantier : ce qui compte sur le
// chantier, sans ouvrir les sections. Logique pure, testée.

const day = (v) => (v ? String(v).slice(0, 10) : '')

/**
 * @param {object} p
 * @param {Array}  p.crs       comptes rendus du chantier
 * @param {Array}  p.tasks     tâches du chantier
 * @param {object} [p.finances] résultat de computeChantierFinances
 * @param {string} p.today     AAAA-MM-JJ (date locale)
 * @returns {{
 *   nextMeeting: { date: string, heure: string, lieu: string } | null,
 *   openPoints: number,
 *   lateTasks: number,
 *   budget: { ratio: number, over: number } | null,
 * }}
 */
export function chantierGlance({ crs = [], tasks = [], finances = null, today }) {
  // Prochaine réunion : celle annoncée au CR le plus récent, si elle n'est pas passée
  const latest = [...crs]
    .filter(c => day(c?.date))
    .sort((a, b) => day(b.date).localeCompare(day(a.date)) || (Number(b.numero) || 0) - (Number(a.numero) || 0))[0]
  const next = latest?.prochaine_reunion
  const nextMeeting = next && day(next.date) && day(next.date) >= today
    ? { date: day(next.date), heure: next.heure || '', lieu: next.lieu || '' }
    : null

  const open = tasks.filter(t => t && t.statut !== 'Terminé')
  // Points de CR (numérotés) encore ouverts ; à défaut de numéro, toute tâche ouverte issue d'un CR
  const openPoints = open.filter(t => t.num_point != null || t.cr_origine_id).length
  const lateTasks = open.filter(t => day(t.echeance) && day(t.echeance) < today).length

  const budget = finances && Number(finances.budget) > 0
    ? { ratio: Number(finances.ratio) || 0, over: Number(finances.depassement) || 0 }
    : null

  return { nextMeeting, openPoints, lateTasks, budget }
}
