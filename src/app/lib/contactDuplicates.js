// Doublons de contacts : détection et préparation de la fusion.
// Logique pure (sans React ni Supabase), testée dans
// __tests__/contactDuplicates.test.js.
//
// Deux contacts sont signalés comme doublons possibles s'ils ont :
//  - la même adresse email ;
//  - le même numéro de téléphone (mobile ou fixe, formats +33 / 0… confondus) ;
//  - le même nom, à la civilité, aux accents, à la casse et à l'ordre des
//    mots près (« M. DEBRIS Julien » = « Julien Debris »), ou une faute de
//    frappe d'une lettre sur un nom assez long ;
//  - le même SIRET (même entreprise : à vérifier, deux personnes d'une même
//    société ne sont pas forcément un doublon).
// Rien n'est fusionné automatiquement : l'utilisateur choisit.

const fold = (s) => String(s || '').toLowerCase()
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')

// Civilités et formes juridiques ignorées dans la comparaison des noms
const NOISE = new Set([
  'm', 'mr', 'mme', 'mlle', 'monsieur', 'madame', 'mademoiselle', 'dr', 'me',
  'sarl', 'sas', 'sasu', 'eurl', 'sa', 'sci', 'ei', 'eirl', 'snc', 'scop', 'ste', 'societe', 'ets', 'etablissements',
  'et', 'de', 'du', 'des', 'la', 'le', 'les',
])

/** Mots significatifs du nom, triés (ordre et civilité ignorés). */
export function nameTokens(nom) {
  return fold(nom).replace(/[^a-z0-9]+/g, ' ').split(' ')
    .filter(t => t && !NOISE.has(t)).sort()
}
export const nameKey = (nom) => nameTokens(nom).join(' ')

export const emailKey = (email) => String(email || '').trim().toLowerCase()

/** Téléphone ramené à ses 9 derniers chiffres (+33 6… = 06…). */
export function phoneKey(tel) {
  const d = String(tel || '').replace(/\D/g, '')
  return d.length >= 9 ? d.slice(-9) : ''
}

export const siretKey = (siret) => {
  const d = String(siret || '').replace(/\D/g, '')
  return d.length === 14 ? d : ''
}

function levenshtein(a, b) {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > 1) return 2
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

/** Raisons pour lesquelles deux contacts semblent être la même personne. */
export function duplicateReasons(a, b) {
  const reasons = []
  const ea = emailKey(a.email)
  if (ea && ea === emailKey(b.email)) reasons.push('même email')
  const pa = [phoneKey(a.tel), phoneKey(a.tel_fixe)].filter(Boolean)
  const pb = new Set([phoneKey(b.tel), phoneKey(b.tel_fixe)].filter(Boolean))
  if (pa.some(p => pb.has(p))) reasons.push('même téléphone')
  const na = nameKey(a.nom), nb = nameKey(b.nom)
  if (na && na === nb) reasons.push('même nom')
  else if (na.length >= 8 && levenshtein(na, nb) === 1) reasons.push('nom presque identique')
  const sa = siretKey(a.siret)
  if (sa && sa === siretKey(b.siret)) reasons.push('même SIRET')
  return reasons
}

export const pairKey = (a, b) => [a, b].sort().join('|')

/**
 * Groupes de doublons possibles (2 contacts ou plus). Les paires marquées
 * « pas un doublon » (`ignored`, Set de pairKey) ne relient pas les contacts.
 * @returns {{ ids: string[], contacts: object[], reasons: string[] }[]}
 */
export function findDuplicateGroups(contacts = [], ignored = new Set()) {
  const list = contacts.filter(c => c && c.id)
  const parent = new Map(list.map(c => [c.id, c.id]))
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x) } return x }
  const reasonsByRoot = new Map()
  const pairReasons = []

  // Index par clé : évite de comparer toutes les paires
  const buckets = new Map()
  const add = (k, c) => { if (!k) return; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(c) }
  for (const c of list) {
    add('e:' + emailKey(c.email), c)
    add('p:' + phoneKey(c.tel), c)
    if (phoneKey(c.tel_fixe) !== phoneKey(c.tel)) add('p:' + phoneKey(c.tel_fixe), c)
    add('s:' + siretKey(c.siret), c)
    const nk = nameKey(c.nom)
    add('n:' + nk, c)
    // Faute de frappe : même nom privé d'une lettre (clé « squelette »)
    if (nk.length >= 8) for (let i = 0; i < nk.length; i++) add('t:' + nk.slice(0, i) + nk.slice(i + 1), c)
  }
  const seen = new Set()
  for (const [k, group] of buckets) {
    if (k.endsWith(':') || group.length < 2) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j]
        if (a.id === b.id) continue
        const pk = pairKey(a.id, b.id)
        if (seen.has(pk) || ignored.has(pk)) continue
        seen.add(pk)
        const reasons = duplicateReasons(a, b)
        if (!reasons.length) continue
        pairReasons.push({ a: a.id, b: b.id, reasons })
        parent.set(find(a.id), find(b.id))
      }
    }
  }
  for (const { a, reasons } of pairReasons) {
    const r = find(a)
    if (!reasonsByRoot.has(r)) reasonsByRoot.set(r, new Set())
    reasons.forEach(x => reasonsByRoot.get(r).add(x))
  }
  const groups = new Map()
  for (const c of list) {
    const r = find(c.id)
    if (!reasonsByRoot.has(r)) continue
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r).push(c)
  }
  const ORDER = ['même email', 'même téléphone', 'même nom', 'nom presque identique', 'même SIRET']
  return [...groups.entries()]
    .map(([r, cs]) => ({
      ids: cs.map(c => c.id),
      contacts: cs,
      reasons: ORDER.filter(x => reasonsByRoot.get(r).has(x)),
    }))
    // Les plus sûrs d'abord (email / téléphone), puis par nom
    .sort((x, y) => ORDER.indexOf(x.reasons[0]) - ORDER.indexOf(y.reasons[0])
      || String(x.contacts[0].nom).localeCompare(String(y.contacts[0].nom), 'fr'))
}

// ─── Fusion ──────────────────────────────────────────────────────────────

/** Champs de la fiche contact (dans l'ordre d'affichage de la fusion). */
export const MERGE_FIELDS = [
  ['nom', 'Nom'], ['type', 'Type'], ['societe', 'Société'], ['fonction', 'Fonction'],
  ['specialite', 'Spécialité'], ['email', 'Email'], ['tel', 'Téléphone'], ['tel_fixe', 'Téléphone fixe'],
  ['adresse', 'Adresse'], ['code_postal', 'Code postal'], ['ville', 'Ville'], ['siret', 'SIRET'],
  ['tva_intra', 'TVA intracom.'], ['site_web', 'Site web'], ['assurance_decennale', 'Assurance décennale'],
  ['assurance_validite', 'Validité assurance'], ['iban', 'IBAN'], ['qualifications', 'Qualifications'],
]

const filled = (v) => v != null && String(v).trim() !== ''

/** Contact le plus complet (proposé comme fiche conservée). */
export function bestContact(contacts = []) {
  const score = (c) => MERGE_FIELDS.filter(([k]) => filled(c[k])).length + (filled(c.notes) ? 1 : 0)
  return [...contacts].sort((a, b) => score(b) - score(a)
    || String(a.created_at || '').localeCompare(String(b.created_at || '')))[0] || null
}

/**
 * Valeurs proposées pour la fiche fusionnée : celles du contact conservé,
 * complétées par celles des autres quand elles manquent. `conflicts` liste
 * les champs où les contacts ont des valeurs différentes (choix à faire).
 */
export function planMerge(keep, others = []) {
  const all = [keep, ...others]
  const fields = {}
  const conflicts = []
  for (const [k, label] of MERGE_FIELDS) {
    const values = [...new Set(all.map(c => c[k]).filter(filled).map(v => String(v).trim()))]
    fields[k] = filled(keep[k]) ? String(keep[k]).trim() : (values[0] ?? null)
    const distinct = new Set(values.map(v => (k === 'email' ? emailKey(v) : k.startsWith('tel') ? phoneKey(v) || v : fold(v))))
    if (distinct.size > 1) conflicts.push({ key: k, label, values })
  }
  // Notes : toutes conservées
  const notes = [...new Set(all.map(c => String(c.notes || '').trim()).filter(Boolean))]
  fields.notes = notes.join('\n\n') || null
  fields.note = Math.max(0, ...all.map(c => Number(c.note) || 0))
  fields.actif = all.some(c => c.actif !== false)
  return { fields, conflicts }
}
