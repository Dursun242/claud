// ═══════════════════════════════════════════════════════════════
// chantierFinances.js — calculs budget / OS d'un chantier.
// ═══════════════════════════════════════════════════════════════
//
// Fonction pure : prend le budget du chantier + la liste des OS,
// retourne l'ensemble des métriques financières (engagé, réalisé,
// brouillon, reste à engager, dépassement, ratio %).
//
// Règles métier :
//   - Engagé     : OS hors "Brouillon" et "Annulé" (envoyés/signés/en cours/terminés)
//   - Réalisé    : OS en "Terminé" (travaux finis)
//   - Brouillon  : OS en "Brouillon" (informatif, pas engagé)
//
// Toute modification de ces catégories doit rester ici pour garantir
// que tous les affichages (détail chantier, KPIs, exports) restent cohérents.

const sum = (arr) => arr.reduce((s, o) => s + (Number(o.montant_ttc) || 0), 0)

/**
 * @param {number} budget — budget du chantier (€)
 * @param {Array<{ statut: string, montant_ttc: number }>} os — liste des OS du chantier
 */
export function computeChantierFinances(budget, os = []) {
  const osEngages = os.filter(o => o.statut !== 'Brouillon' && o.statut !== 'Annulé')
  const osRealises = os.filter(o => o.statut === 'Terminé')
  const osBrouillons = os.filter(o => o.statut === 'Brouillon')

  const safeBudget = Number(budget) || 0
  const engageMontant = sum(osEngages)
  const realiseMontant = sum(osRealises)
  const brouillonMontant = sum(osBrouillons)

  return {
    budget: safeBudget,
    engageMontant,
    engageCount: osEngages.length,
    realiseMontant,
    realiseCount: osRealises.length,
    brouillonMontant,
    brouillonCount: osBrouillons.length,
    resteEngager: Math.max(0, safeBudget - engageMontant),
    depassement: Math.max(0, engageMontant - safeBudget),
    ratio: safeBudget > 0 ? Math.round((engageMontant / safeBudget) * 100) : 0,
  }
}
