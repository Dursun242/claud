/**
 * Normalisation des réponses de l'API Recherche d'entreprises
 * (https://recherche-entreprises.api.gouv.fr — API publique de l'État,
 * gratuite, sans clé, données SIRENE / RNE / RNCS).
 *
 * On produit une shape stable, consommée par hooks/useEntrepriseSearch.js
 * et ContactFormModal.js :
 *
 *   {
 *     denomination, siren, siret, num_tva_intracommunautaire,
 *     code_naf, libelle_activite_principale, forme_juridique, date_creation,
 *     siege: { siret, adresse_ligne_1, code_postal, ville },
 *     representants: [{ prenom, nom, qualite }],
 *     etablissements: [{ siret, adresse_ligne_1, code_postal, ville }],
 *   }
 *
 * Fichier pur (pas de 'use client') : testable côté node.
 */

// Libellés NAF les plus courants dans le bâtiment (l'API ne renvoie que
// le code). Fallback : le code brut.
export const NAF_LABELS = {
  '41.10A': 'Promotion immobilière de logements',
  '41.20A': 'Construction de maisons individuelles',
  '41.20B': 'Construction d\'autres bâtiments',
  '42.11Z': 'Construction de routes et autoroutes',
  '42.21Z': 'Construction de réseaux pour fluides',
  '42.22Z': 'Construction de réseaux électriques et de télécommunications',
  '42.99Z': 'Construction d\'autres ouvrages de génie civil',
  '43.11Z': 'Travaux de démolition',
  '43.12A': 'Travaux de terrassement courants et travaux préparatoires',
  '43.12B': 'Travaux de terrassement spécialisés ou de grande masse',
  '43.13Z': 'Forages et sondages',
  '43.21A': 'Travaux d\'installation électrique dans tous locaux',
  '43.21B': 'Travaux d\'installation électrique sur la voie publique',
  '43.22A': 'Travaux d\'installation d\'eau et de gaz en tous locaux',
  '43.22B': 'Travaux d\'installation d\'équipements thermiques et de climatisation',
  '43.29A': 'Travaux d\'isolation',
  '43.29B': 'Autres travaux d\'installation',
  '43.31Z': 'Travaux de plâtrerie',
  '43.32A': 'Travaux de menuiserie bois et PVC',
  '43.32B': 'Travaux de menuiserie métallique et serrurerie',
  '43.32C': 'Agencement de lieux de vente',
  '43.33Z': 'Travaux de revêtement des sols et des murs',
  '43.34Z': 'Travaux de peinture et vitrerie',
  '43.39Z': 'Autres travaux de finition',
  '43.91A': 'Travaux de charpente',
  '43.91B': 'Travaux de couverture par éléments',
  '43.99A': 'Travaux d\'étanchéification',
  '43.99B': 'Travaux de montage de structures métalliques',
  '43.99C': 'Travaux de maçonnerie générale et gros œuvre de bâtiment',
  '43.99D': 'Autres travaux spécialisés de construction',
  '43.99E': 'Location avec opérateur de matériel de construction',
  '71.11Z': 'Activités d\'architecture',
  '71.12A': 'Activité des géomètres',
  '71.12B': 'Ingénierie, études techniques',
  '68.20A': 'Location de logements',
  '68.20B': 'Location de terrains et d\'autres biens immobiliers',
  '68.31Z': 'Agences immobilières',
  '68.32A': 'Administration d\'immeubles et autres biens immobiliers',
  '81.21Z': 'Nettoyage courant des bâtiments',
  '81.30Z': 'Services d\'aménagement paysager',
}

export const nafLabel = (code) => (code && NAF_LABELS[code]) || code || ''

/**
 * Numéro de TVA intracommunautaire français, déduit du SIREN :
 * clé = (12 + 3 × (SIREN mod 97)) mod 97.
 */
export function tvaFromSiren(siren) {
  const s = String(siren || '').replace(/\D/g, '')
  if (s.length !== 9) return null
  const key = (12 + 3 * (Number(s) % 97)) % 97
  return `FR${String(key).padStart(2, '0')}${s}`
}

const cap = (s) => (s || '').toLowerCase().replace(/(^|[\s-'])\S/g, (c) => c.toUpperCase())

function normalizeEtablissement(e = {}) {
  const ligne1 = [e.numero_voie, e.indice_repetition, e.type_voie, e.libelle_voie]
    .filter(Boolean).join(' ').trim()
  return {
    siret: e.siret || null,
    adresse_ligne_1: ligne1 || (e.adresse || '').replace(/\s\d{5}\s.*$/, '').trim() || null,
    code_postal: e.code_postal || null,
    ville: e.libelle_commune ? cap(e.libelle_commune) : null,
    etat: e.etat_administratif || null,
  }
}

function normalizeDirigeant(d = {}) {
  if (d.type_de_personne === 'personne morale') {
    return { prenom: '', nom: d.denomination || '', qualite: d.qualite || '', personne_morale: true, siren: d.siren || null }
  }
  return {
    prenom: cap((d.prenoms || '').split(/[,\s]+/)[0] || ''),
    nom: (d.nom || '').toUpperCase(),
    qualite: d.qualite || '',
    personne_morale: false,
  }
}

/** Normalise un résultat (une unité légale) de /search. */
export function normalizeEntreprise(r = {}) {
  const siege = normalizeEtablissement(r.siege || {})
  const etabs = (r.matching_etablissements || []).map(normalizeEtablissement)
  return {
    siren: r.siren || null,
    siret: siege.siret,
    denomination: r.nom_complet || r.nom_raison_sociale || '',
    sigle: r.sigle || null,
    num_tva_intracommunautaire: tvaFromSiren(r.siren),
    code_naf: r.activite_principale || null,
    libelle_activite_principale: nafLabel(r.activite_principale),
    forme_juridique: r.nature_juridique || null,
    date_creation: r.date_creation || null,
    etat: r.etat_administratif || null,
    nombre_etablissements: r.nombre_etablissements ?? null,
    siege,
    representants: (r.dirigeants || []).map(normalizeDirigeant),
    etablissements: etabs,
  }
}

/**
 * Pour un lookup par SIRET : si l'établissement demandé n'est pas le siège,
 * on remonte son adresse à la place de celle du siège.
 */
export function pickEtablissement(entreprise, siret) {
  if (!siret) return entreprise
  const e = (entreprise.etablissements || []).find(x => x.siret === siret)
  if (!e) return entreprise
  return { ...entreprise, siret: e.siret, siege: { ...entreprise.siege, ...e } }
}

/**
 * Construit la liste « dirigeants » à partir des résultats : pour chaque
 * entreprise, les personnes physiques dont le nom contient un mot de la
 * requête (≥ 3 lettres). Permet de chercher « Yusuf Caglayan » et de
 * retrouver ses sociétés.
 */
export function extractDirigeants(entreprises = [], q = '') {
  const tokens = String(q).toLowerCase().split(/\s+/).filter(t => t.length >= 3)
  if (!tokens.length) return []
  const out = []
  for (const ent of entreprises) {
    for (const d of ent.representants || []) {
      if (d.personne_morale) continue
      const full = `${d.prenom} ${d.nom}`.toLowerCase()
      if (tokens.some(t => full.includes(t))) {
        out.push({
          nom: d.nom, prenom: d.prenom, qualite: d.qualite,
          entreprises: [{ denomination: ent.denomination, siret: ent.siret, siren: ent.siren, siege: ent.siege }],
        })
      }
    }
  }
  return out
}
