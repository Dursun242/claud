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

export async function executeAiAction(action, { SB, crmDb, clientMode = false } = {}) {
  const type = action?.type
  const d = action?.data || {}
  if (clientMode && !CLIENT_ALLOWED.has(type)) {
    throw new Error("Cette action est réservée à votre maître d'œuvre.")
  }
  switch (type) {
    case 'add_chantier':  await SB.upsertChantier(d); return 'Chantier créé'
    case 'add_task':      await SB.upsertTask(d);     return 'Tâche créée'
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
