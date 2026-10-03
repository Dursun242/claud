'use client'
/**
 * Accès données du module CRM (Supabase).
 *
 * Volontairement hors de `dashboards/shared.js` (dette documentée : 870
 * lignes) : toutes les requêtes CRM vivent ici et prennent le client
 * Supabase en dépendance explicite pour rester testables.
 *
 * Tables : crm_opportunites, crm_interactions (migration 025),
 *          crm_devis (migration 027).
 */
import { supabase as defaultClient } from '../supabaseClient'
import { writeActivityLog } from './activityLog'
import { isClosed, probaForEtape } from './crm'
import { computeDevisTotals, normalizeLignes } from './devis'
import { loadCrmWith } from './crmLoad'

const log = (sb, action, entityType, id, label) =>
  writeActivityLog(sb, { action, entity_type: entityType, entity_id: id, entity_label: label })


/**
 * Charge tout le CRM en une fois (requêtes dans lib/crmLoad.js, partagées
 * avec le mail du matin côté serveur).
 * `devisMissing` = migration 027 absente (la section Devis est masquée).
 * @returns {{ opportunites: Array, interactions: Array, devis: Array,
 *             missingMigration: boolean, devisMissing: boolean }}
 */
export async function loadCrm(sb = defaultClient) {
  return loadCrmWith(sb)
}

/** Crée ou met à jour une opportunité. Retourne la ligne persistée. */
export async function upsertOpportunite(o, sb = defaultClient) {
  const etape = o.etape || 'Prospect'
  const row = {
    titre: String(o.titre || '').trim(),
    etape,
    contact_id: o.contact_id || null,
    chantier_id: o.chantier_id || null,
    montant_estime: Number(o.montant_estime) || 0,
    probabilite: probaForEtape(etape, o.probabilite),
    source: o.source || null,
    type_projet: o.type_projet || null,
    adresse: o.adresse || null,
    date_cloture_prevue: o.date_cloture_prevue || null,
    // Date de clôture posée automatiquement au passage Gagné / Perdu,
    // effacée si on rouvre l'affaire.
    date_cloture: isClosed(etape)
      ? (o.date_cloture || new Date().toISOString().slice(0, 10))
      : null,
    motif_perte: etape === 'Perdu' ? (o.motif_perte || null) : null,
    notes: o.notes || null,
  }
  // Lien devis Qonto (migration 026) : n'envoie les colonnes que si
  // renseignées, pour rester compatible avec une base sans la 026.
  if (o.qonto_quote_id) {
    row.qonto_quote_id = String(o.qonto_quote_id)
    row.qonto_quote_number = o.qonto_quote_number || null
  }
  if (o.id) {
    const { data, error } = await sb.from('crm_opportunites')
      .update(row).eq('id', o.id).select().single()
    if (error) throw new Error('Erreur mise à jour opportunité : ' + error.message)
    log(sb, 'update', 'crm_opportunite', data.id, data.titre)
    // Affaire gagnée / perdue : les relances en attente n'ont plus d'objet
    if (isClosed(etape)) await closeFollowUps({ opportuniteId: data.id }, sb)
    return data
  }
  const { data: { user } = {} } = await sb.auth.getUser()
  const { data, error } = await sb.from('crm_opportunites')
    .insert({ ...row, created_by: user?.email || null }).select().single()
  if (error) throw new Error('Erreur création opportunité : ' + error.message)
  log(sb, 'create', 'crm_opportunite', data.id, data.titre)
  return data
}

/** Change uniquement l'étape (drag & drop / bouton « avancer »). */
export async function moveOpportunite(opp, etape, extra = {}, sb = defaultClient) {
  return upsertOpportunite({ ...opp, ...extra, etape }, sb)
}

export async function deleteOpportunite(id, sb = defaultClient) {
  const { data: prev } = await sb.from('crm_opportunites').select('titre').eq('id', id).maybeSingle()
  const { error } = await sb.from('crm_opportunites').delete().eq('id', id)
  if (error) throw new Error('Erreur suppression opportunité : ' + error.message)
  log(sb, 'delete', 'crm_opportunite', id, prev?.titre || null)
}

/** Crée ou met à jour une interaction. */
export async function upsertInteraction(i, sb = defaultClient) {
  const row = {
    opportunite_id: i.opportunite_id || null,
    contact_id: i.contact_id || null,
    type: i.type || 'Note',
    sujet: String(i.sujet || '').trim(),
    contenu: i.contenu || null,
    date: i.date || new Date().toISOString(),
    prochaine_action: i.prochaine_action || null,
    prochaine_action_date: i.prochaine_action_date || null,
    action_faite: !!i.action_faite,
  }
  if (i.id) {
    const { data, error } = await sb.from('crm_interactions')
      .update(row).eq('id', i.id).select().single()
    if (error) throw new Error('Erreur mise à jour interaction : ' + error.message)
    log(sb, 'update', 'crm_interaction', data.id, data.sujet)
    return data
  }
  const { data: { user } = {} } = await sb.auth.getUser()
  const { data, error } = await sb.from('crm_interactions')
    .insert({ ...row, created_by: user?.email || null }).select().single()
  if (error) throw new Error('Erreur création interaction : ' + error.message)
  log(sb, 'create', 'crm_interaction', data.id, data.sujet)
  return data
}

/**
 * Solde les relances encore ouvertes devenues sans objet : celles de
 * l'affaire (affaire gagnée / perdue) ou celles d'un devis précis (devis
 * accepté / refusé). Jamais bloquant ; renvoie le nombre de relances soldées.
 */
export async function closeFollowUps({ opportuniteId, devisNumero = null }, sb = defaultClient) {
  if (!opportuniteId) return 0
  try {
    let q = sb.from('crm_interactions').update({ action_faite: true })
      .eq('opportunite_id', opportuniteId).eq('action_faite', false).not('prochaine_action_date', 'is', null)
    if (devisNumero) q = q.ilike('sujet', `Devis ${devisNumero} %`)
    const { data, error } = await q.select('id')
    return error ? 0 : (data || []).length
  } catch {
    return 0
  }
}

/** Coche / décoche la prochaine action d'une interaction. */
export async function setActionFaite(id, faite, sb = defaultClient) {
  const { error } = await sb.from('crm_interactions')
    .update({ action_faite: !!faite }).eq('id', id)
  if (error) throw new Error('Erreur mise à jour relance : ' + error.message)
}

export async function deleteInteraction(id, sb = defaultClient) {
  const { error } = await sb.from('crm_interactions').delete().eq('id', id)
  if (error) throw new Error('Erreur suppression interaction : ' + error.message)
  log(sb, 'delete', 'crm_interaction', id, null)
}

/**
 * Rattache un chantier fraîchement créé à l'opportunité (passage Gagné).
 * La création du chantier elle-même passe par SB.upsertChantier (shared.js)
 * pour réutiliser la logique existante ; ici on ne fait que le lien.
 */
export async function linkOpportuniteToChantier(oppId, chantierId, sb = defaultClient) {
  const { data, error } = await sb.from('crm_opportunites')
    .update({ chantier_id: chantierId, etape: 'Gagné', probabilite: 100,
              date_cloture: new Date().toISOString().slice(0, 10) })
    .eq('id', oppId).select().single()
  if (error) throw new Error('Erreur liaison chantier : ' + error.message)
  log(sb, 'convert', 'crm_opportunite', oppId, data?.titre || null)
  return data
}


// ─── Devis (migration 027) ───

/**
 * Crée ou met à jour un devis. Les totaux sont recalculés ici à partir des
 * lignes (source de vérité) puis dénormalisés pour les listes.
 */
export async function upsertDevis(d, sb = defaultClient) {
  const lignes = normalizeLignes(d.lignes)
  const totals = computeDevisTotals(lignes, d)
  const row = {
    opportunite_id: d.opportunite_id,
    numero: String(d.numero || '').trim(),
    statut: d.statut || 'Brouillon',
    objet: d.objet || null,
    date_emission: d.date_emission || new Date().toISOString().slice(0, 10),
    date_validite: d.date_validite || null,
    lignes,
    remise_pct: Number(d.remise_pct) || 0,
    acompte_pct: Number(d.acompte_pct) || 0,
    conditions: d.conditions || null,
    notes: d.notes || null,
    total_ht: totals.ht,
    total_tva: totals.tva,
    total_ttc: totals.ttc,
    date_envoi: d.date_envoi || null,
    date_reponse: d.date_reponse || null,
  }
  const label = `Devis ${row.numero}`
  if (d.id) {
    const { data, error } = await sb.from('crm_devis')
      .update(row).eq('id', d.id).select().single()
    if (error) throw new Error('Erreur mise à jour devis : ' + error.message)
    log(sb, 'update', 'crm_devis', data.id, label)
    return data
  }
  const { data: { user } = {} } = await sb.auth.getUser()
  const { data, error } = await sb.from('crm_devis')
    .insert({ ...row, created_by: user?.email || null }).select().single()
  if (error) {
    if (error.code === '23505') throw new Error(`Le numéro ${row.numero} existe déjà : change-le ou recharge la page.`)
    throw new Error('Erreur création devis : ' + error.message)
  }
  log(sb, 'create', 'crm_devis', data.id, label)
  return data
}

/**
 * Change le statut d'un devis. Pose date_envoi au passage « Envoyé » et
 * date_reponse au passage « Accepté » / « Refusé ».
 */
export async function setDevisStatut(devis, statut, sb = defaultClient) {
  const today = new Date().toISOString().slice(0, 10)
  const patch = { statut }
  if (statut === 'Envoyé') { patch.date_envoi = devis.date_envoi || today; patch.date_reponse = null }
  else if (statut === 'Accepté' || statut === 'Refusé') patch.date_reponse = today
  else if (statut === 'Brouillon') { patch.date_envoi = null; patch.date_reponse = null }
  const { data, error } = await sb.from('crm_devis')
    .update(patch).eq('id', devis.id).select().single()
  if (error) throw new Error('Erreur mise à jour devis : ' + error.message)
  log(sb, 'update', 'crm_devis', devis.id, `Devis ${devis.numero} → ${statut}`)
  // Réponse reçue : la relance « Relancer le devis » n'a plus d'objet
  if ((statut === 'Accepté' || statut === 'Refusé') && devis.numero) {
    await closeFollowUps({ opportuniteId: data.opportunite_id || devis.opportunite_id, devisNumero: devis.numero }, sb)
  }
  return data
}

export async function deleteDevis(devis, sb = defaultClient) {
  const { error } = await sb.from('crm_devis').delete().eq('id', devis.id)
  if (error) throw new Error('Erreur suppression devis : ' + error.message)
  log(sb, 'delete', 'crm_devis', devis.id, `Devis ${devis.numero}`)
}
