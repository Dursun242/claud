/**
 * notifications.js — création et distribution des notifications (SERVEUR).
 *
 * Utilisé par les routes API (PV de réception…). Les créations / mises à
 * jour faites dans l'application passent, elles, par les triggers SQL
 * (migrations 011+). Ce helper :
 *   1. Résout la liste des destinataires (staff actif + MOA du chantier)
 *   2. Construit titre + corps détaillé + auteur formaté
 *   3. Insère le tout en bulk dans la table `notifications`
 *
 * Tout passe par le client service role : la liste des utilisateurs
 * (emails, rôles) n'est jamais lisible depuis le navigateur.
 */

import { adminClient } from './supabaseClients'

const STAFF_ROLES = ['admin', 'salarie', 'salarié']
const norm = (e) => String(e || '').toLowerCase().trim()

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
 * Display-name de l'acteur (prénom nom + rôle) depuis authorized_users,
 * fallback sur le local-part de l'email.
 */
async function resolveActorDisplay(admin, actorEmail) {
  if (!actorEmail) return null
  try {
    const { data } = await admin
      .from('authorized_users')
      .select('email, prenom, nom, role')
      .ilike('email', actorEmail)
    const row = (data || []).find(u => norm(u.email) === actorEmail)
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
 * Destinataires. Chaque panneau « Activité récente » fonctionne comme un
 * journal : chacun voit tout ce qui le concerne, y compris ses actions.
 *
 *   - Staff (admin/salarié) : tous les actifs, y compris l'acteur.
 *   - Client (MOA) du chantier : clients actifs dont le prénom correspond
 *     au champ `client` du chantier (règle historique du projet).
 */
async function resolveRecipients(admin, { chantierId }) {
  const [{ data: users }, chResult] = await Promise.all([
    admin.from('authorized_users').select('email, prenom, role, actif').eq('actif', true),
    chantierId
      ? admin.from('chantiers').select('client').eq('id', chantierId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const clientFirstName = norm(chResult?.data?.client)
  const recipients = new Set()
  for (const u of users || []) {
    const e = norm(u.email)
    if (!e) continue
    if (STAFF_ROLES.includes(u.role)) recipients.add(e)
    else if (u.role === 'client' && clientFirstName && norm(u.prenom) === clientFirstName) recipients.add(e)
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
 * @param {string} [params.actorEmail] — email de l'acteur (affiché dans le titre)
 */
export async function createNotifications({ entityType, entityId, chantierId, action = 'create', data, actorEmail }) {
  try {
    // Exclure les notifications pour les chantiers démo
    const DEMO_UUIDS = new Set([
      '11111111-1111-4111-8111-111111111d01', // Villa Moreau
      '22222222-2222-4222-8222-222222222d02', // Maison Petit
      '33333333-3333-4333-8333-333333333d03', // Pharmacie Normandie
    ])

    if (chantierId && DEMO_UUIDS.has(chantierId)) {
      return // Silencieusement ignoré
    }

    const admin = adminClient()
    const actor = norm(actorEmail)
    // Nom du chantier + nom de l'acteur + destinataires (best-effort, parallélisé)
    const [chResult, actorDisplay, recipients] = await Promise.all([
      chantierId
        ? admin.from('chantiers').select('nom').eq('id', chantierId).maybeSingle()
        : Promise.resolve({ data: null }),
      resolveActorDisplay(admin, actor),
      resolveRecipients(admin, { chantierId }),
    ])
    const chantierName = chResult?.data?.nom || null

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

    const { error } = await admin.from('notifications').insert(rows)
    if (error) console.warn('[notifications] insert échec:', error.message)
  } catch (err) {
    console.warn('[notifications] exception:', err?.message || err)
  }
}
