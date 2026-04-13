'use client'
/**
 * notifications.js — helper de création et distribution des notifications.
 *
 * Chaque upsert* dans shared.js appelle createNotifications() avec le type
 * d'entité et son payload. Ce helper :
 *   1. Résout la liste des destinataires (staff + MOA concerné)
 *   2. Construit une ligne par destinataire avec titre + tab cible
 *   3. Insère le tout en bulk dans la table `notifications`
 *
 * Important : on n'envoie jamais de notif à l'auteur de l'action
 *             (évite le bruit "tu as créé X").
 */

import { supabase } from '../supabaseClient'

// Mapping entity_type → (titre, tab UI cible)
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
 * Récupère la liste des destinataires :
 *   - Tous les admins/salariés actifs (sauf l'acteur)
 *   - Le(s) client(s) MOA du chantier concerné (matching prénom → authorized_users)
 */
async function resolveRecipients({ chantierId, actorEmail }) {
  const recipients = new Set()

  // Staff (admin + salarié actifs)
  const { data: staff } = await supabase
    .from('authorized_users')
    .select('email, role, actif')
    .eq('actif', true)
    .in('role', ['admin', 'salarié', 'salarie'])
  ;(staff || []).forEach(u => {
    const e = (u.email || '').toLowerCase().trim()
    if (e && e !== actorEmail) recipients.add(e)
  })

  // Client MOA du chantier (matching prénom)
  if (chantierId) {
    const { data: ch } = await supabase
      .from('chantiers')
      .select('client')
      .eq('id', chantierId)
      .maybeSingle()
    const clientFirstName = (ch?.client || '').toLowerCase().trim()
    if (clientFirstName) {
      const { data: clients } = await supabase
        .from('authorized_users')
        .select('email, prenom, role, actif')
        .eq('actif', true)
        .eq('role', 'client')
      ;(clients || []).forEach(u => {
        const prenom = (u.prenom || '').toLowerCase().trim()
        const e = (u.email || '').toLowerCase().trim()
        if (prenom && e && prenom === clientFirstName && e !== actorEmail) {
          recipients.add(e)
        }
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
 * @param {Object} [params.data]      — payload de l'entité (pour titre)
 * @param {string} [params.actorEmail] — email de l'acteur (on ne lui envoie pas à lui-même)
 */
export async function createNotifications({ entityType, entityId, chantierId, action = 'create', data, actorEmail }) {
  try {
    const actor = (actorEmail || '').toLowerCase().trim()
    // Récupère le nom du chantier pour le titre (best-effort)
    let chantierName = null
    if (chantierId) {
      const { data: ch } = await supabase.from('chantiers').select('nom').eq('id', chantierId).maybeSingle()
      chantierName = ch?.nom || null
    }
    const recipients = await resolveRecipients({ chantierId, actorEmail: actor })
    if (!recipients.length) return

    const title = titleFor(entityType, action, data, chantierName)
    const target_tab = tabFor(entityType)

    const rows = recipients.map(recipient_email => ({
      recipient_email,
      actor_email: actor || null,
      kind: action,
      entity_type: entityType,
      entity_id: entityId || null,
      chantier_id: chantierId || null,
      title,
      body: null,
      target_tab,
    }))

    const { error } = await supabase.from('notifications').insert(rows)
    if (error) console.warn('[notifications] insert échec:', error.message)
  } catch (err) {
    console.warn('[notifications] exception:', err?.message || err)
  }
}
