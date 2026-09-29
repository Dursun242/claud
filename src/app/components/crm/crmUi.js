// Constantes et petits helpers d'affichage partagés par les écrans du CRM.

export const TYPES_PROJET = ['Rénovation', 'Construction neuve', 'Extension', 'Réhabilitation', 'Aménagement', 'Autre']
export const todayISO = () => new Date().toISOString().slice(0, 10)
export const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
export const nextWeekday = (dow) => { // 1 = lundi … 5 = vendredi
  const d = new Date(); const diff = (dow - d.getDay() + 7) % 7 || 7
  d.setDate(d.getDate() + diff); return d.toISOString().slice(0, 10)
}

// Ce que l'app suggère de faire ensuite, par étape. Une seule phrase,
// un seul bouton : l'utilisateur n'a pas à réfléchir à « quoi faire ».
export const NEXT_STEP = {
  'Prospect':     { text: 'Appelle le client pour comprendre son projet.', cta: '📞 Noter un appel', action: 'call' },
  'Qualifié':     { text: 'Le besoin est clair : prépare et envoie le devis.', cta: '📄 Créer le devis', action: 'devis' },
  'Devis envoyé': { text: 'Relance le client si tu n’as pas de réponse.', cta: '📞 Noter une relance', action: 'call' },
  'Négociation':  { text: 'Conclus : gagné ou perdu ?',                   cta: null },
}

// Étiquettes de relance rapide (un clic = une date)
export const RELANCE_CHIPS = [
  { l: 'Demain',            d: () => addDays(1) },
  { l: 'Dans 3 jours',      d: () => addDays(3) },
  { l: 'Vendredi',          d: () => nextWeekday(5) },
  { l: 'Semaine prochaine', d: () => addDays(7) },
]

// Sujet par défaut d'un échange (« Appel avec Dupont »…). Un sujet encore
// automatique est régénéré quand on change de type.
const AUTO_SUJETS = /^(Appel|Email|Réunion|Visite|Note)( avec .+| chez .+| sur .+)?$/
export const isAutoSujet = (s) => !s || AUTO_SUJETS.test(s)
export function defaultSujet(type, contact) {
  const who = contact ? (contact.societe || contact.nom) : null
  if (!who) return type
  if (type === 'Visite') return `Visite chez ${who}`
  if (type === 'Note') return `Note sur ${who}`
  return `${type} avec ${who}`
}

export const chip = (active, color) => ({
  padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  border: `1px solid ${active ? color : '#E2E8F0'}`, background: active ? color : '#fff', color: active ? '#fff' : '#334155',
})

export const iconBtn = {
  background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 6, cursor: 'pointer',
  padding: '3px 7px', fontSize: 12, fontFamily: 'inherit', color: '#475569', lineHeight: 1.2,
}
