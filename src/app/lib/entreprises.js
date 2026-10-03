// Annuaire des entreprises (État) — conversion des réponses de l'API
// publique et gratuite recherche-entreprises.api.gouv.fr (données INSEE /
// RNE, sans clé) vers la forme utilisée par la fiche contact. Logique pure,
// testée dans __tests__/entreprises.test.js.
//
// L'API ne donne ni téléphone, ni email, ni site web, ni le libellé du code
// NAF : la TVA intracommunautaire est calculée depuis le SIREN et le libellé
// des activités courantes du bâtiment vient de la table ci-dessous.

export const ANNUAIRE_URL = 'https://recherche-entreprises.api.gouv.fr/search'

/** N° de TVA intracommunautaire français calculé depuis le SIREN. */
export function tvaIntra(siren) {
  const s = String(siren || '').replace(/\D/g, '')
  if (s.length !== 9) return ''
  const key = (12 + 3 * (Number(s) % 97)) % 97
  return `FR${String(key).padStart(2, '0')}${s}`
}

const NAF = {
  '41.10A': 'Promotion immobilière de logements',
  '41.10B': 'Promotion immobilière de bureaux',
  '41.10C': "Promotion immobilière d'autres bâtiments",
  '41.20A': 'Construction de maisons individuelles',
  '41.20B': "Construction d'autres bâtiments",
  '42.11Z': 'Construction de routes et autoroutes',
  '42.13A': "Construction d'ouvrages d'art",
  '42.21Z': 'Construction de réseaux pour fluides',
  '42.22Z': 'Construction de réseaux électriques et de télécommunications',
  '42.91Z': "Construction d'ouvrages maritimes et fluviaux",
  '42.99Z': "Construction d'autres ouvrages de génie civil",
  '43.11Z': 'Travaux de démolition',
  '43.12A': 'Travaux de terrassement courants et travaux préparatoires',
  '43.12B': 'Travaux de terrassement spécialisés ou de grande masse',
  '43.13Z': 'Forages et sondages',
  '43.21A': "Travaux d'installation électrique",
  '43.21B': "Travaux d'installation électrique sur la voie publique",
  '43.22A': "Travaux d'installation d'eau et de gaz (plomberie)",
  '43.22B': "Travaux d'installation d'équipements thermiques et de climatisation",
  '43.29A': "Travaux d'isolation",
  '43.29B': "Autres travaux d'installation",
  '43.31Z': 'Travaux de plâtrerie',
  '43.32A': 'Travaux de menuiserie bois et PVC',
  '43.32B': 'Travaux de menuiserie métallique et serrurerie',
  '43.32C': 'Agencement de lieux de vente',
  '43.33Z': 'Travaux de revêtement des sols et des murs',
  '43.34Z': 'Travaux de peinture et vitrerie',
  '43.39Z': 'Autres travaux de finition',
  '43.91A': 'Travaux de charpente',
  '43.91B': 'Travaux de couverture',
  '43.99A': "Travaux d'étanchéification",
  '43.99B': 'Travaux de montage de structures métalliques',
  '43.99C': 'Travaux de maçonnerie générale et gros œuvre de bâtiment',
  '43.99D': 'Autres travaux spécialisés de construction',
  '43.99E': 'Location avec opérateur de matériel de construction',
  '16.23Z': "Fabrication de charpentes et d'autres menuiseries",
  '23.61Z': "Fabrication d'éléments en béton pour la construction",
  '23.63Z': 'Fabrication de béton prêt à l’emploi',
  '25.11Z': 'Fabrication de structures métalliques',
  '46.73A': 'Commerce de gros de bois et de matériaux de construction',
  '46.73B': "Commerce de gros d'appareils sanitaires et de produits de décoration",
  '46.74B': 'Commerce de gros de fournitures pour la plomberie et le chauffage',
  '47.52A': 'Commerce de détail de quincaillerie, peintures et verres (petites surfaces)',
  '47.52B': 'Commerce de détail de quincaillerie, peintures et verres (grandes surfaces)',
  '68.10Z': 'Marchand de biens immobiliers',
  '68.20A': 'Location de logements',
  '68.20B': "Location de terrains et d'autres biens immobiliers",
  '68.31Z': 'Agence immobilière',
  '68.32A': "Administration d'immeubles (syndic, gestion)",
  '70.22Z': 'Conseil pour les affaires et la gestion',
  '71.11Z': "Activités d'architecture",
  '71.12A': 'Géomètre',
  '71.12B': 'Ingénierie, études techniques',
  '71.20B': 'Analyses, essais et inspections techniques',
  '74.10Z': 'Activités spécialisées de design',
  '77.32Z': 'Location de machines et équipements pour la construction',
  '81.21Z': 'Nettoyage courant des bâtiments',
  '81.22Z': 'Autres activités de nettoyage des bâtiments',
  '81.30Z': "Services d'aménagement paysager",
}

/** Libellé d'un code NAF (activités courantes), sinon « NAF <code> ». */
export function nafLabel(code) {
  const c = String(code || '').trim().toUpperCase()
  if (!c) return ''
  return NAF[c] || `NAF ${c}`
}

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const words = (s) => fold(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length >= 2)

// « 12 RUE DE PARIS 76600 LE HAVRE » → « 12 RUE DE PARIS »
function addressLine(etab) {
  const full = String(etab?.adresse || '').trim()
  const cp = String(etab?.code_postal || '')
  if (cp) {
    const i = full.lastIndexOf(cp)
    if (i > 0) return full.slice(0, i).trim()
  }
  const parts = [etab?.numero_voie, etab?.indice_repetition, etab?.type_voie, etab?.libelle_voie].filter(Boolean)
  return parts.length ? parts.join(' ') : full
}

function etablissement(etab) {
  return {
    siret: etab?.siret || '',
    adresse_ligne_1: addressLine(etab),
    code_postal: etab?.code_postal || '',
    ville: etab?.libelle_commune || '',
  }
}

function personne(d) {
  return {
    prenom: String(d?.prenoms || '').trim().split(/\s+/)[0] || '',
    nom: String(d?.nom || '').trim(),
    qualite: d?.qualite || '',
  }
}

/**
 * Résultat de l'annuaire → entreprise au format de la fiche contact.
 * `siret` : établissement recherché (sinon le siège).
 */
export function normalizeEntreprise(r, siret = '') {
  if (!r) return null
  const wanted = String(siret || '').replace(/\D/g, '')
  const match = wanted && (r.matching_etablissements || []).find(e => e.siret === wanted)
  const etab = match || (wanted && r.siege?.siret === wanted ? r.siege : null) || r.siege || {}
  const lieu = etablissement(etab)
  const naf = etab.activite_principale || r.activite_principale || ''
  return {
    siren: r.siren || '',
    siret: lieu.siret,
    denomination: r.nom_raison_sociale || r.nom_complet || '',
    siege: lieu,
    num_tva_intracommunautaire: tvaIntra(r.siren),
    code_naf: naf,
    libelle_activite_principale: nafLabel(naf),
    representants: (r.dirigeants || []).filter(d => d.type_dirigeant !== 'personne morale' && d.nom).map(personne),
    active: r.etat_administratif !== 'C',
  }
}

/**
 * Résultats d'une recherche texte → { resultats, dirigeants } :
 * une entreprise trouvée par le nom d'un de ses dirigeants apparaît dans
 * « dirigeants » (avec la personne), les autres dans « resultats ».
 */
export function splitSearchResults(results = [], q = '') {
  const tokens = words(q)
  const resultats = []
  const dirigeants = []
  for (const r of results) {
    const ent = normalizeEntreprise(r)
    if (!ent) continue
    const nameWords = new Set(words(ent.denomination))
    const byName = tokens.length > 0 && tokens.every(t => nameWords.has(t))
    const persons = tokens.length === 0 ? [] : (r.dirigeants || [])
      .filter(d => d.type_dirigeant !== 'personne morale' && d.nom)
      .filter(d => { const w = new Set(words(`${d.prenoms || ''} ${d.nom}`)); return tokens.every(t => w.has(t)) })
    if (persons.length && !byName) {
      for (const d of persons) dirigeants.push({ ...personne(d), entreprises: [ent] })
    } else {
      resultats.push(ent)
    }
  }
  return { resultats, dirigeants }
}
