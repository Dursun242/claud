'use client'
/**
 * notifications.js — helper de création et distribution des notifications.
 *
 * Chaque upsert* dans shared.js appelle createNotifications() avec le type
 * d'entité et son payload. Ce helper :
 *   1. Résout la liste des destinataires (staff + MOA concerné)
 *   2. Construit titre + corps détaillé + auteur formaté
 *   3. Insère le tout en bulk dans la table `notifications`
 *
 * Important : on n'envoie jamais de notif à l'auteur de l'action
 *             (évite le bruit "tu as créé X").
 */

import { supabase } from '../supabaseClient'

// Formatage humain d'une taille en octets
function formatSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

function formatMoney(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return `${Math.round(n).toLocaleString('fr-FR')} €`
}

function formatDate(iso) {
  if (!iso) return null
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) }
  catch { return null }
}

// Titre concis (une ligne)
function titleFor(entityType, action, data, chantierName) {
  const a = action === 'create' ? 'ajouté' : action === 'update' ? 'mis à jour' : 'supprimé'
  const who = chantierName ? ` sur ${chantierName}` : ''
  switch (entityType) {
    case 'chantier':   return `Nouveau chantier : ${data?.nom || '—'}`
    case 'os':         return `OS ${data?.numero || ''} ${a}${who}`
    case 'cr':         return `Compte rendu n°${data?.numero || ''} ${a}${who}`
    case 'task':       return `Tâche « ${data?.titre || '—'} » ${a}${who}`
    case 'attachment': return `Pièce jointe « ${data?.file_name || '—'} » ${a}${who}`
    case 'comment':    return `Nouveau commentaire${who}`
    default:           return `Nouvelle activité${who}`
  }
}

// Corps détaillé (infos métier, une ou deux lignes)
function bodyFor(entityType, data) {
  if (!data) return null
  const parts = []
  switch (entityType) {
    case 'os': {
      if (data.artisan_nom)    parts.push(`Artisan : ${data.artisan_nom}`)
      const m = formatMoney(data.montant_ttc)
      if (m)                   parts.push(`Montant TTC : ${m}`)
      if (data.statut)         parts.push(`Statut : ${data.statut}`)
      const d = formatDate(data.date_intervention || data.date_emission)
      if (d)                   parts.push(`Intervention : ${d}`)
      break
    }
    case 'cr': {
      const d = formatDate(data.date)
      if (d)                   parts.push(`Date : ${d}`)
      if (data.participants)   parts.push(`Participants : ${String(data.participants).slice(0, 80)}`)
      if (data.resume)         parts.push(String(data.resume).slice(0, 120))
      break
    }
    case 'task': {
      if (data.priorite)       parts.push(data.priorite)
      if (data.lot)            parts.push(`Lot : ${data.lot}`)
      const e = formatDate(data.echeance)
      if (e)                   parts.push(`Échéance : ${e}`)
      if (data.statut)         parts.push(`Statut : ${data.statut}`)
      break
    }
    case 'chantier': {
      if (data.client)         parts.push(`Client : ${data.client}`)
      if (data.phase)          parts.push(`Phase : ${data.phase}`)
      const b = formatMoney(data.budget)
      if (b)                   parts.push(`Budget : ${b}`)
      if (data.adresse)        parts.push(String(data.adresse).slice(0, 80))
      break
    }
    case 'attachment': {
      if (data.file_type)      parts.push(data.file_type)
      const s = data.file_size ? formatSize(data.file_size) : null
      if (s)                   parts.push(s)
      break
    }
    case 'comment': {
      if (data.content)        parts.push(String(data.content).slice(0, 140))
      break
    }
    default: break
  }
  return parts.length ? parts.join(' · ') : null
}

function tabFor(entityType) {
  switch (entityType) {
    case 'chantier':   return 'projects'
    case 'os':         return 'os'
    case 'cr':         return 'reports'
    case 'task':       return 'tasks'
    case 'attachment': return 'projects'
    case 'comment':    return 'projects'
    default:           return 'dashboard'
  }
}

/**
 * Résout le display-name de l'acteur (prénom + rôle) depuis authorized_users,
 * fallback sur le local-part de l'email.
 *
 * Passe par la RPC `get_user_display` (SECURITY DEFINER, migration 018)
 * pour éviter d'exposer un SELECT direct sur authorized_users aux clients.
 */
async function resolveActorDisplay(actorEmail) {
  if (!actorEmail) return null
  try {
    const { data } = await supabase
      .rpc('get_user_display', { p_email: actorEmail })
    const row = Array.isArray(data) ? data[0] : data
    if (row) {
      const name = [row.prenom, row.nom].filter(Boolean).join(' ').trim() || actorEmail.split('@')[0]
      const role = row.role === 'admin' ? 'admin'
        : row.role === 'salarié' || row.role === 'salarie' ? 'salarié'
        : row.role === 'client' ? 'client'
        : null
      return role ? `${name} (${role})` : name
    }
  } catch (_) {}
  return actorEmail.split('@')[0]
}

/**
 * Résout la liste des destinataires. Chaque panneau "Activité récente"
 * fonctionne comme un journal historique : chaque utilisateur voit
 * tout ce qui le concerne, y compris ses propres actions.
 *
 *   - Staff (admin/salarié) : TOUS les actifs, y compris l'acteur.
 *   - Client (MOA) du chantier : inclus y compris s'il est l'acteur.
 */
async function resolveRecipients({ chantierId, actorEmail }) {
  const recipients = new Set()

  // Staff (admin + salarié actifs) via RPC SECURITY DEFINER (migration 018)
  // — évite d'exposer un SELECT direct sur authorized_users aux clients.
  const { data: staff } = await supabase.rpc('get_staff_recipients')
  ;(staff || []).forEach(u => {
    const e = (u.email || '').toLowerCase().trim()
    if (e) recipients.add(e)
  })

  // Client MOA du chantier (matching prénom) — même logique via RPC.
  if (chantierId) {
    const { data: ch } = await supabase
      .from('chantiers')
      .select('client')
      .eq('id', chantierId)
      .maybeSingle()
    const clientFirstName = (ch?.client || '').toLowerCase().trim()
    if (clientFirstName) {
      const { data: clients } = await supabase
        .rpc('get_client_recipients_by_firstname', { p_firstname: clientFirstName })
      ;(clients || []).forEach(u => {
        const e = (u.email || '').toLowerCase().trim()
        if (e) recipients.add(e)
      })
    }
  }

  return Array.from(recipients)
}

/**
 * Crée une notification par destinataire.
 *
 * @param {Object} params
 * @param {string} params.entityType  — 'chantier' | 'os' | 'cr' | 'task' | 'attachment' | 'comment'
 * @param {string} params.entityId
 * @param {string} [params.chantierId]
 * @param {string} params.action      — 'create' (par défaut) | 'update' | 'delete'
 * @param {Object} [params.data]      — payload de l'entité (pour titre + body)
 * @param {string} [params.actorEmail] — email de l'acteur (on ne lui envoie pas à lui-même)
 */
export async function createNotifications({ entityType, entityId, chantierId, action = 'create', data, actorEmail }) {
  try {
    const actor = (actorEmail || '').toLowerCase().trim()
    // Récupère le nom du chantier + nom de l'acteur (best-effort, parallélisé)
    const [chResult, actorDisplay] = await Promise.all([
      chantierId
        ? supabase.from('chantiers').select('nom').eq('id', chantierId).maybeSingle()
        : Promise.resolve({ data: null }),
      resolveActorDisplay(actor),
    ])
    const chantierName = chResult?.data?.nom || null

    const recipients = await resolveRecipients({ chantierId, actorEmail: actor })
    if (!recipients.length) return

    const baseTitle = titleFor(entityType, action, data, chantierName)
    const title = actorDisplay ? `${baseTitle} — par ${actorDisplay}` : baseTitle
    const body = bodyFor(entityType, data)
    const target_tab = tabFor(entityType)

    const rows = recipients.map(recipient_email => ({
      recipient_email,
      actor_email: actor || null,
      kind: action,
      entity_type: entityType,
      entity_id: entityId || null,
      chantier_id: chantierId || null,
      title,
      body,
      target_tab,
    }))

    const { error } = await supabase.from('notifications').insert(rows)
    if (error) console.warn('[notifications] insert échec:', error.message)
  } catch (err) {
    console.warn('[notifications] exception:', err?.message || err)
  }
}
