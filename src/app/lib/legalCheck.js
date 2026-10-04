// Contrôle automatique de la situation légale d'une entreprise, à partir de
// sources publiques et gratuites :
//   - Annuaire des entreprises (recherche-entreprises.api.gouv.fr) :
//     entreprise active ou fermée (cessée, radiée) ;
//   - BODACC (bodacc-datadila.opendatasoft.com) : procédures collectives
//     (sauvegarde, redressement, liquidation judiciaire) et radiations.
// Logique pure : lecture des réponses et synthèse. Les appels sont dans
// legalCheckServer.js. Tests : __tests__/legalCheck.test.js.
//
// Lecture défensive : une réponse illisible ou une source injoignable donne
// « non vérifié », jamais un faux « tout va bien ».

export const BODACC_URL = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records'

export const LEGAL_META = {
  ok: { label: 'Entreprise active', color: '#047857', bg: '#ECFDF5', border: '#A7F3D0', rank: 0 },
  inconnu: { label: 'Non vérifiée', color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0', rank: 1 },
  alerte: { label: 'Procédure en cours', color: '#B45309', bg: '#FFFBEB', border: '#FDE68A', rank: 2 },
  critique: { label: 'Entreprise fermée ou en liquidation', color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA', rank: 3 },
}

export const sirenOfSiret = (v) => {
  const d = String(v || '').replace(/\D/g, '')
  return d.length >= 9 ? d.slice(0, 9) : ''
}

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const iso = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : null)

/** Réponse de l'annuaire (recherche par SIREN) → { etat: 'active'|'fermee'|null, dateFermeture, nom }. */
export function parseAnnuaire(json, siren) {
  const results = Array.isArray(json?.results) ? json.results : null
  if (!results) return { etat: null }
  const r = results.find(x => String(x?.siren || '') === siren)
  if (!r) return { etat: null, introuvable: true }
  const etat = r.etat_administratif === 'C' ? 'fermee' : r.etat_administratif === 'A' ? 'active' : null
  return { etat, dateFermeture: iso(r.date_fermeture) || iso(r.siege?.date_fermeture), nom: r.nom_raison_sociale || r.nom_complet || null }
}

function jugementOf(rec) {
  let j = rec?.jugement
  if (typeof j === 'string') { try { j = JSON.parse(j) } catch { j = { nature: j } } }
  return j && typeof j === 'object' ? j : {}
}

const registreHas = (rec, siren) => {
  const reg = Array.isArray(rec?.registre) ? rec.registre.join(' ') : String(rec?.registre ?? '')
  return reg.replace(/\s/g, '').includes(siren)
}

/** Gravité d'une annonce de procédure collective, d'après la nature du jugement. */
export function procedureSeverity(nature) {
  const n = fold(nature)
  if (/liquidation/.test(n)) return 'critique'
  if (/(cloture|fin de la procedure|extinction)/.test(n)) return 'terminee'
  if (/(plan de (redressement|sauvegarde)|arrete du plan|homologation)/.test(n)) return 'alerte'
  if (/(redressement|sauvegarde|ouverture|conversion|procedure collective)/.test(n)) return 'alerte'
  return 'alerte'
}

/**
 * Réponse BODACC → dernière procédure collective et dernière radiation
 * concernant ce SIREN. null si la réponse est illisible.
 */
export function parseBodacc(json, siren) {
  const results = Array.isArray(json?.results) ? json.results : null
  if (!results) return null
  const mine = results.filter(r => registreHas(r, siren))
    .sort((a, b) => String(b.dateparution || '').localeCompare(String(a.dateparution || '')))
  const family = (r) => fold(r.familleavis || r.familleavis_lib)
  const coll = mine.find(r => /collective/.test(family(r)))
  const rad = mine.find(r => /radiation/.test(family(r)))
  const procedure = coll ? (() => {
    const j = jugementOf(coll)
    const nature = String(j.nature || j.famille || coll.typeavis_lib || 'Procédure collective').trim()
    return { nature, date: iso(j.date) || iso(coll.dateparution), parution: iso(coll.dateparution), tribunal: coll.tribunal || null, severity: procedureSeverity(nature) }
  })() : null
  const radiation = rad ? { date: iso(rad.dateparution) } : null
  return { procedure, radiation }
}

const fmt = (d) => (d ? d.split('-').reverse().join('/') : '')

/**
 * Synthèse : { statut: 'ok'|'alerte'|'critique'|'inconnu', libelle, details }.
 * @param {{ siren, annuaire, bodacc }} p  annuaire = parseAnnuaire(...) ou null, bodacc = parseBodacc(...) ou null
 */
export function legalStatus({ siren, annuaire = null, bodacc = null } = {}) {
  if (!siren) return { statut: 'inconnu', libelle: 'Pas de SIRET sur la fiche : contrôle impossible', details: {} }
  const details = { annuaire: annuaire?.etat || null, dateFermeture: annuaire?.dateFermeture || null, procedure: bodacc?.procedure || null, radiation: bodacc?.radiation || null, bodaccLu: !!bodacc, annuaireLu: !!annuaire?.etat }
  if (annuaire?.etat === 'fermee') {
    return { statut: 'critique', libelle: `Entreprise fermée${annuaire.dateFermeture ? ` depuis le ${fmt(annuaire.dateFermeture)}` : ''} (annuaire des entreprises)`, details }
  }
  const p = bodacc?.procedure
  if (p?.severity === 'critique') return { statut: 'critique', libelle: `${p.nature} (BODACC du ${fmt(p.parution || p.date)})`, details }
  if (bodacc?.radiation && (!p || String(bodacc.radiation.date) >= String(p.parution || ''))) {
    return { statut: 'critique', libelle: `Radiation publiée au BODACC le ${fmt(bodacc.radiation.date)}`, details }
  }
  if (p?.severity === 'alerte') return { statut: 'alerte', libelle: `${p.nature} (BODACC du ${fmt(p.parution || p.date)})`, details }
  if (annuaire?.etat === 'active' && bodacc) {
    return { statut: 'ok', libelle: p ? `Entreprise active · dernière procédure terminée (${fmt(p.parution)})` : 'Entreprise active, aucune procédure collective publiée', details }
  }
  if (annuaire?.etat === 'active') return { statut: 'inconnu', libelle: 'Entreprise active (annuaire) · BODACC non consulté', details }
  if (annuaire?.introuvable) return { statut: 'inconnu', libelle: 'SIREN introuvable dans l’annuaire des entreprises : vérifiez le SIRET de la fiche', details }
  return { statut: 'inconnu', libelle: 'Sources officielles injoignables : contrôle à refaire', details }
}

/** Le statut s'est dégradé (pour prévenir l'équipe une seule fois). */
export function worsened(previous, next) {
  const rank = (s) => LEGAL_META[s]?.rank ?? 1
  return ['alerte', 'critique'].includes(next) && rank(next) > rank(previous || 'ok') && previous !== next
}
