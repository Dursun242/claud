// Génération d'un DPGF par l'IA, côté navigateur, en deux temps :
//   1. « trame » : lots et contenu de chacun, métré clé commun, hypothèses ;
//   2. « lot » : postes chiffrés de chaque lot, plusieurs lots en parallèle
//      (chaque appel reste court : tient dans la limite de durée du serveur,
//      même avec un modèle puissant et lent).
// Un lot en échec est retenté une fois ; s'il échoue encore, il reste vide
// et son nom est renvoyé dans `echecs` (à compléter dans l'éditeur).
// `post(body)` appelle /api/chiffrage/ia et renvoie `data`.

const NOMS_IA = { mistral: 'Mistral', anthropic: 'Claude' }

/**
 * @param {(body: object) => Promise<object>} post
 * @param {object} body  description, surface_m2, metre, lots (du chantier), refs, chantierId…
 * @param {{ onProgress?: (p: { etape: 'trame'|'lots', fait?: number, total?: number }) => void, parallele?: number }} opts
 * @returns {Promise<{ lots, surface_m2, hypotheses, non_compris, conseils, echecs: string[], ia: string }>}
 */
export async function genererDpgf(post, body, { onProgress, parallele = 4 } = {}) {
  onProgress?.({ etape: 'trame' })
  const trame = await post({ ...body, action: 'trame' })
  const n = trame.lots.length
  const commun = {
    chantierId: body.chantierId, chantier: body.chantier, adresse: body.adresse,
    description: body.description, metre: body.metre, refs: body.refs,
    surface_m2: body.surface_m2 || trame.surface_m2,
    metre_cle: trame.metre_cle, hypotheses: trame.hypotheses,
  }
  const lots = new Array(n)
  const echecs = []
  const ias = new Set(trame.ia ? [trame.ia] : [])
  let suivant = 0
  let fait = 0
  onProgress?.({ etape: 'lots', fait, total: n })
  const travailleur = async () => {
    while (suivant < n) {
      const i = suivant++
      const lot = trame.lots[i]
      let res = null
      for (let essai = 0; essai < 2 && !res; essai++) {
        try {
          res = await post({ ...commun, action: 'lot', lot, autres_lots: trame.lots.filter((_, j) => j !== i) })
        } catch {
          if (essai === 1) echecs.push(lot.nom)
        }
      }
      if (res?.ia) ias.add(res.ia)
      lots[i] = { nom: lot.nom, postes: res?.postes || [] }
      fait += 1
      onProgress?.({ etape: 'lots', fait, total: n })
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallele, n) }, travailleur))
  if (echecs.length === n) throw new Error('Chiffrage des lots impossible pour le moment : réessayer dans quelques instants.')
  return {
    lots,
    surface_m2: commun.surface_m2 || null,
    hypotheses: trame.hypotheses || [],
    non_compris: trame.non_compris || [],
    conseils: trame.conseils || [],
    echecs,
    ia: [...ias].map(p => NOMS_IA[p] || p).join(' + '),
  }
}
