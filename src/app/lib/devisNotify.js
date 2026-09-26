// devisNotify.js — prévient l'équipe d'un événement sur un devis (signature,
// acceptation / annulation dans Qonto) : notification dans l'application
// (cloche, tout le staff actif) + mail sur la boîte de la société
// (DEVIS_NOTIFY_EMAIL, sinon SMTP_USER). Jamais bloquant : les erreurs sont
// seulement journalisées.

import { smtpConfig, sendMail } from './mailer'

export const fmtEur = (n) => `${(Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

export async function notifyTeam(admin, { devisId, title, body, mailLines = [], attachments }, log) {
  try {
    const { data: staff } = await admin.from('authorized_users').select('email, role, actif')
    const emails = [...new Set((staff || [])
      .filter(u => u.actif === true && ['admin', 'salarie', 'salarié'].includes(u.role) && u.email)
      .map(u => String(u.email).trim().toLowerCase()))]
    if (emails.length) {
      const { error } = await admin.from('notifications').insert(emails.map(recipient_email => ({
        recipient_email, actor_email: null, kind: 'update', entity_type: 'devis', entity_id: devisId,
        chantier_id: null, title, body, target_tab: 'crm',
      })))
      if (error) log?.warn('notification devis', error.message)
    }
  } catch (e) { log?.warn('notification devis', e?.message || e) }

  try {
    const cfg = smtpConfig()
    if (!cfg) return
    await sendMail(cfg, {
      to: cfg.notify,
      subject: title,
      text: mailLines.filter(l => l !== null && l !== undefined).join('\n'),
      ...(attachments ? { attachments } : {}),
    })
  } catch (e) { log?.warn('mail devis', e?.code || e?.message || e) }
}
