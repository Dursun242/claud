/**
 * Exécution des blocs <<<ACTION>>> renvoyés par l'assistant IA.
 *
 * Extrait de pages/AIV.js pour être testable : les dépendances (SB pour
 * les entités historiques, crmDb pour le CRM) sont injectées.
 *
 * Retourne le libellé à afficher (toast + fin de réponse) ou lève une
 * erreur si l'action est inconnue / refusée.
 */

const CLIENT_ALLOWED = new Set(['add_task'])

// Actions CRM : réservées au staff, jamais disponibles en mode client.
export const CRM_ACTIONS = new Set([
  'add_opportunite', 'update_opportunite', 'add_interaction', 'action_faite',
])

export function computeOsTotals(prestations = []) {
  let ht = 0, tva = 0
  for (const p of prestations) {
    const l = (parseFloat(p.quantite) || 0) * (parseFloat(p.prix_unitaire) || 0)
    ht += l
    tva += l * (parseFloat(p.tva_taux) || 20) / 100
  }
  return { montant_ht: ht, montant_tva: tva, montant_ttc: ht + tva }
}

/** Actions qui suppriment : exécutées seulement après confirmation de l'utilisateur. */
export const DELETE_ACTIONS = new Set(['delete_task'])

export async function executeAiAction(action, { SB, crmDb, clientMode = false, tasks = [] } = {}) {
  const type = action?.type
  const d = action?.data || {}
  if (clientMode && !CLIENT_ALLOWED.has(type)) {
    throw new Error("Cette action est réservée à votre maître d'œuvre.")
  }
  switch (type) {
    case 'add_chantier':  await SB.upsertChantier(d); return 'Chantier créé'
    case 'add_task':      await SB.upsertTask(d);     return 'Tâche créée'
    case 'update_task': {
      // Champs non fournis : ceux de la tâche existante (pas d'effacement)
      const cur = tasks.find(t => t.id === d.id)
      if (!d.id || !cur) throw new Error('update_task : tâche introuvable.')
      await SB.upsertTask({ ...cur, chantier_id: cur.chantier_id || cur.chantierId, ...d })
      return 'Tâche mise à jour'
    }
    case 'delete_task': {
      if (!d.id || !tasks.some(t => t.id === d.id)) throw new Error('delete_task : tâche introuvable.')
      await SB.deleteTask(d.id)
      return 'Tâche supprimée'
    }
    case 'add_contact':   await SB.upsertContact(d);  return 'Contact créé'
    case 'update_contact':await SB.upsertContact(d);  return 'Contact mis à jour'
    case 'add_cr':        await SB.upsertCR(d);       return 'Compte rendu créé'
    case 'update_cr':     await SB.upsertCR(d);       return 'Compte rendu mis à jour'
    case 'add_os':
    case 'update_os': {
      await SB.upsertOS({ ...d, ...computeOsTotals(d.prestations) })
      return type === 'update_os' ? 'Ordre de Service mis à jour' : 'Ordre de Service créé'
    }
    case 'add_opportunite': {
      const { id: _ignored, ...rest } = d
      await crmDb.upsertOpportunite(rest)
      return 'Opportunité créée'
    }
    case 'update_opportunite': {
      if (!d.id) throw new Error("update_opportunite : id de l'opportunité manquant.")
      await crmDb.upsertOpportunite(d)
      return 'Opportunité mise à jour'
    }
    case 'add_interaction': {
      if (!d.opportunite_id && !d.contact_id) {
        throw new Error('add_interaction : opportunite_id ou contact_id requis.')
      }
      await crmDb.upsertInteraction(d)
      return 'Interaction enregistrée'
    }
    case 'action_faite': {
      if (!d.id) throw new Error('action_faite : id de l\'interaction manquant.')
      await crmDb.setActionFaite(d.id, d.faite !== false)
      return 'Relance marquée comme faite'
    }
    default:
      throw new Error(`Action inconnue : ${type || '—'}`)
  }
}

// ─── Lecture des blocs <<<ACTION>>> ──────────────────────────────────────
const BLOCK_RE = /<<<ACTION>>>([\s\S]*?)(?:<<<END_ACTION>>>|$)/g

// JSON tel que l'écrivent les modèles : bloc ```json, commentaires, virgules
// en trop avant } ou ]
function cleanJson(raw) {
  return String(raw || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1')
    .trim()
}

// Objets { … } de premier niveau mis bout à bout (plusieurs actions sans liste)
function splitObjects(str) {
  const out = []
  let depth = 0, start = -1, inStr = false, esc = false
  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') { if (depth === 0) start = i; depth += 1 }
    else if (c === '}' && depth > 0) { depth -= 1; if (depth === 0 && start >= 0) { out.push(str.slice(start, i + 1)); start = -1 } }
  }
  return out
}

// Une action, une liste d'actions, ou une action dont `data` est une liste
function flatten(v) {
  if (Array.isArray(v)) return v.flatMap(flatten)
  if (!v || typeof v !== 'object' || !v.type) return []
  if (Array.isArray(v.data)) return v.data.map(data => ({ type: v.type, data }))
  return [v]
}

/**
 * Actions contenues dans la réponse de l'IA : tous les blocs <<<ACTION>>>,
 * chacun pouvant contenir une action, une liste d'actions ou plusieurs
 * objets à la suite. `invalid` : nombre de morceaux illisibles.
 * `text` : la réponse sans les blocs.
 * @returns {{ actions: object[], invalid: number, text: string }}
 */
export function parseAiActions(reply = '') {
  const actions = []
  let invalid = 0
  for (const m of String(reply).matchAll(BLOCK_RE)) {
    const body = cleanJson(m[1])
    if (!body) continue
    try {
      actions.push(...flatten(JSON.parse(body)))
      continue
    } catch { /* plusieurs objets à la suite ou JSON abîmé */ }
    const parts = splitObjects(body)
    if (!parts.length) { invalid += 1; continue }
    for (const part of parts) {
      try { actions.push(...flatten(JSON.parse(part))) } catch { invalid += 1 }
    }
  }
  return { actions, invalid, text: String(reply).replace(BLOCK_RE, '').trim() }
}

const PLURIELS = {
  'Tâche créée': 'tâches créées', 'Tâche mise à jour': 'tâches mises à jour', 'Tâche supprimée': 'tâches supprimées', 'Chantier créé': 'chantiers créés', 'Contact créé': 'contacts créés',
  'Contact mis à jour': 'contacts mis à jour', 'Compte rendu créé': 'comptes rendus créés',
  'Ordre de Service créé': 'ordres de service créés', 'Opportunité créée': 'opportunités créées',
  'Interaction enregistrée': 'interactions enregistrées', 'Relance marquée comme faite': 'relances marquées comme faites',
}

/** « 3 tâches créées », « Tâche créée » : résumé des libellés d'actions réussies. */
export function summarizeLabels(labels = []) {
  const counts = new Map()
  for (const l of labels) counts.set(l, (counts.get(l) || 0) + 1)
  return [...counts].map(([l, n]) => (n > 1 ? `${n} ${PLURIELS[l] || `× ${l.toLowerCase()}`}` : l)).join(', ')
}

/** Fragment de prompt système décrivant les actions CRM (admin uniquement). */
export const CRM_PROMPT = `
CRM (pipeline commercial) — données dans "crm" ci-dessus (opportunites, interactions_recentes, relances) :
- Étapes possibles : "Prospect", "Qualifié", "Devis envoyé", "Négociation", "Gagné", "Perdu".
- Types d'interaction : "Appel", "Email", "Réunion", "Visite", "Note".

add_opportunite: {"type":"add_opportunite","data":{
  "titre":"...","etape":"Prospect","montant_estime":0,"probabilite":10,
  "contact_id":"UUID-CONTACT-OU-null","type_projet":"Rénovation","source":"Bouche à oreille",
  "adresse":"...","date_cloture_prevue":"YYYY-MM-DD","notes":"..."}}

update_opportunite: {"type":"update_opportunite","data":{
  "id":"UUID-EXISTANT","titre":"...","etape":"Négociation","montant_estime":0,"probabilite":70,
  "contact_id":"...","notes":"...","motif_perte":"obligatoire si etape = Perdu"}}
  (reprends TOUS les champs existants de l'opportunité et ne change que ce qui est demandé)

add_interaction: {"type":"add_interaction","data":{
  "opportunite_id":"UUID-OPPORTUNITE","contact_id":"UUID-CONTACT-OU-null","type":"Appel",
  "sujet":"...","contenu":"...","date":"YYYY-MM-DDTHH:MM:00",
  "prochaine_action":"...","prochaine_action_date":"YYYY-MM-DD"}}

action_faite: {"type":"action_faite","data":{"id":"UUID-INTERACTION","faite":true}}

Exemples : « j'ai appelé Dupont, il veut un devis, relance vendredi » → add_interaction (type Appel,
prochaine_action "Envoyer le devis", prochaine_action_date = vendredi prochain) sur l'opportunité
de Dupont ; s'il n'y a pas d'opportunité pour lui, crée-la d'abord (add_opportunite) et dis-le.
« Quelles relances aujourd'hui ? » → liste les interactions de relances.aujourdhui et en_retard.
`
