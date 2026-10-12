// Relance automatique des affaires en attente, côté serveur (service role) :
// envoi du mail de reprise et suivi dans le CRM. Logique du contenu et des
// règles dans lib/crmReprise.js.

import { sendMail } from './mailer'
import { devisMailHtml } from './devisMailHtml'
import { COMPANY } from './company'
import { LOGO_CID, LOGO_PNG_BASE64 } from './companyLogo'
import { newSignToken } from './devisSignature'
import {
  repriseMailContent, repriseMailText, repriseChoices, repriseUrl,
  addDaysISO, RELANCE_SANS_REPONSE_JOURS, ACTION_SANS_REPONSE,
} from './crmReprise'

/**
 * Solde les rappels encore ouverts d'une affaire : tous, ou seulement ceux
 * de reprise de contact (« Reprendre contact… »). Jamais bloquant.
 */
export async function closeRepriseFollowUps(admin, oppId, mode = 'reprise', log) {
  if (!oppId || !mode) return 0
  try {
    let q = admin.from('crm_interactions').update({ action_faite: true })
      .eq('opportunite_id', oppId).eq('action_faite', false).not('prochaine_action_date', 'is', null)
    if (mode === 'reprise') q = q.ilike('prochaine_action', 'Reprendre contact%')
    const { data, error } = await q.select('id')
    if (error) throw new Error(error.message)
    return (data || []).length
  } catch (e) {
    log?.warn?.('rappels', e?.message || e)
    return 0
  }
}

/**
 * Envoie le mail de reprise d'une affaire puis note le suivi : jeton et date
 * d'envoi sur l'affaire, rappels de reprise soldés, échange noté avec un
 * rappel à J+14 si le client ne répond pas.
 * L'erreur d'envoi remonte (rien n'est noté) ; le suivi ne bloque pas.
 */
export async function sendRepriseMail(admin, cfg, { opp, contact, origin, today, log }) {
  const token = opp.reprise_token || newSignToken()
  const { subject, intro, outro } = repriseMailContent({ opp, contact, company: COMPANY })
  const text = repriseMailText({ intro, outro, link: repriseUrl(origin, token) })
  const html = devisMailHtml({
    body: intro, bodyAfter: outro, company: COMPANY, title: subject, logoSrc: `cid:${LOGO_CID}`,
    choicesTitle: 'Cliquez simplement sur la réponse qui correspond à votre situation :',
    choices: repriseChoices(origin, token),
  })
  const logo = { filename: 'logo-id-maitrise.png', content: Buffer.from(LOGO_PNG_BASE64, 'base64'), contentType: 'image/png', cid: LOGO_CID, contentDisposition: 'inline' }
  await sendMail(cfg, { to: contact.email, subject, text, html, attachments: [logo] })

  const { error } = await admin.from('crm_opportunites')
    .update({ reprise_token: token, reprise_envoyee_le: today }).eq('id', opp.id)
  if (error) log?.warn?.('affaire après mail de reprise', error.message)
  await closeRepriseFollowUps(admin, opp.id, 'reprise', log)
  const { error: e2 } = await admin.from('crm_interactions').insert({
    opportunite_id: opp.id, contact_id: opp.contact_id || null, type: 'Email',
    sujet: 'Mail de reprise de contact envoyé (automatique)',
    contenu: `Envoyé à ${contact.email}`,
    date: new Date().toISOString(),
    prochaine_action: ACTION_SANS_REPONSE,
    prochaine_action_date: addDaysISO(today, RELANCE_SANS_REPONSE_JOURS),
    action_faite: false, created_by: null,
  })
  if (e2) log?.warn?.('échange après mail de reprise', e2.message)
  return token
}
