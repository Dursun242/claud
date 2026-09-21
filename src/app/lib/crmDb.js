'use client'
/**
 * Accès données du module CRM (Supabase).
 *
 * Volontairement hors de `dashboards/shared.js` (dette documentée : 870
 * lignes) : toutes les requêtes CRM vivent ici et prennent le client
 * Supabase en dépendance explicite pour rester testables.
 *
 * Tables : crm_opportunites, crm_interactions (migration 025).
 */
import { supabase as defaultClient } from '../supabaseClient'
import { writeActivityLog } from './activityLog'
import { isClosed, probaForEtape } from './crm'

// Code Postgres « relation does not exist » : migration 025 pas appliquée.
const MISSING_TABLE = '42P01'
const isMissingTable = (err) =>
  err && (err.code === MISSING_TABLE || /does not exist/i.test(err.message || ''))

const log = (sb, action, entityType, id, label) =>
  writeActivityLog(sb, { action, entity_type: entityType, entity_id: id, entity_label: label })


/**
 * Charge tout le CRM en une fois (volume attendu : quelques centaines de
 * lignes max pour une maîtrise d'œuvre).
 * @returns {{ opportunites: Array, interactions: Array, missingMigration: boolean }}
 */
export async function loadCrm(sb = defaultClient) {
  const [opp, inter] = await Promise.all([
    sb.from('crm_opportunites').select('*').order('updated_at', { ascending: false }),
    sb.from('crm_interactions').select('*').order('date', { ascending: false }).limit(1000),
  ])
  if (opp.error) {
    if (isMissingTable(opp.error)) return { opportunites: [], interactions: [], missingMigration: true }
    throw new Error('Erreur chargement CRM : ' + opp.error.message)
  }
  return {
    opportunites: opp.data || [],
    interactions: inter.error ? [] : (inter.data || []),
    missingMigration: false,
  }
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
  if (o.id) {
    const { data, error } = await sb.from('crm_opportunites')
      .update(row).eq('id', o.id).select().single()
    if (error) throw new Error('Erreur mise à jour opportunité : ' + error.message)
    log(sb, 'update', 'crm_opportunite', data.id, data.titre)
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

