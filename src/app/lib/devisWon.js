// devisWon.js — devis signé / accepté → le travail est planifié (serveur).
//
// Appelé à la signature en ligne (/api/devis/public) et quand le devis est
// accepté dans Qonto (/api/cron/qonto-status) :
//   1. chantier : celui déjà rattaché à l'affaire, sinon créé depuis
//      l'affaire (même règle que « Créer le chantier » dans le CRM) et
//      rattaché à l'affaire + au contact ;
//   2. tâche « Lancer les travaux — devis N signé » (Urgent, échéance J+7)
//      sur ce chantier, visible dans l'onglet Tâches.
// Idempotent : rappelé pour le même devis, il ne recrée ni chantier ni
// tâche. Ne lève jamais (la signature ne doit pas échouer pour ça).

import { opportuniteToChantier } from './crm'

const todayParis = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
function addDaysISO(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const taskTitleForDevis = (devis, how = 'signé') => `Lancer les travaux — devis ${devis.numero} ${how}`

/**
 * @param {object} admin  client Supabase service role
 * @param {object} devis  ligne crm_devis (id, numero, objet, opportunite_id, total_ht)
 * @param {{ how?: string, log?: object }} [opts] how : « signé » | « accepté dans Qonto »
 * @returns {Promise<{ chantier: {id, nom}|null, chantierCreated: boolean, taskCreated: boolean }>}
 */
export async function planWorkForDevis(admin, devis, { how = 'signé', log } = {}) {
  const result = { chantier: null, chantierCreated: false, taskCreated: false }
  try {
    const { data: opp } = devis.opportunite_id
      ? await admin.from('crm_opportunites').select('*').eq('id', devis.opportunite_id).maybeSingle()
      : { data: null }

    // 1. Chantier existant (déjà rattaché à l'affaire) ou nouveau
    if (opp?.chantier_id) {
      const { data: ch } = await admin.from('chantiers').select('id, nom').eq('id', opp.chantier_id).maybeSingle()
      result.chantier = ch || null
    }
    if (!result.chantier) {
      let contact = null
      if (opp?.contact_id) {
        const { data } = await admin.from('contacts').select('id, nom, societe, adresse').eq('id', opp.contact_id).maybeSingle()
        contact = data || null
      }
      const source = opp || { titre: devis.objet || `Devis ${devis.numero}`, notes: null }
      const base = opportuniteToChantier({ ...source, montant_estime: Number(devis.total_ht) || source.montant_estime }, contact)
      const { data: ch, error } = await admin.from('chantiers').insert({
        nom: base.nom, client: base.client, adresse: base.adresse || null,
        phase: base.phase, statut: base.statut, budget: base.budget, depenses: 0,
        lots: [], notes_internes: `${base.notes_internes}\nCréé automatiquement : devis ${devis.numero} ${how}.`,
      }).select('id, nom').single()
      if (error) throw new Error('création chantier : ' + error.message)
      result.chantier = ch
      result.chantierCreated = true
      if (opp) await admin.from('crm_opportunites').update({ chantier_id: ch.id }).eq('id', opp.id)
      if (contact) {
        const { error: linkErr } = await admin.from('contact_chantiers').insert({ contact_id: contact.id, chantier_id: ch.id })
        if (linkErr) log?.warn('lien contact/chantier', linkErr.message)
      }
    }

    // 2. Tâche « Lancer les travaux » (une seule par devis)
    const titre = taskTitleForDevis(devis, how)
    const { data: existing } = await admin.from('taches').select('id').eq('chantier_id', result.chantier.id).eq('titre', titre).limit(1)
    if (!existing?.length) {
      const { error } = await admin.from('taches').insert({
        chantier_id: result.chantier.id, titre, priorite: 'Urgent', statut: 'Planifié',
        echeance: addDaysISO(todayParis(), 7), lot: null,
      })
      if (error) throw new Error('création tâche : ' + error.message)
      result.taskCreated = true
    }
  } catch (e) {
    log?.warn('planification des travaux', e?.message || e)
  }
  return result
}

/** Ligne de mail décrivant ce qui a été planifié (ou null). */
export function planSummary(plan) {
  if (!plan?.chantier) return null
  return `${plan.chantierCreated ? 'Chantier créé' : 'Chantier'} : « ${plan.chantier.nom} »${plan.taskCreated ? ' · tâche « Lancer les travaux » ajoutée (Tâches, échéance J+7)' : ''}.`
}
