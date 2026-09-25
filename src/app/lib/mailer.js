// mailer.js — envoi SMTP côté serveur (nodemailer), configuré par les
// variables SMTP_* (voir .env.example). Utilisé par /api/devis/send (envoi
// des devis) et /api/devis/public (notification de signature).

import nodemailer from 'nodemailer'

// Valeurs saisies à la main dans Vercel : on tolère espaces et guillemets
// autour, et les espaces dans le mot de passe d'application Google (affiché
// par groupes de 4 : « abcd efgh ijkl mnop »).
const clean = (v) => String(v ?? '').trim().replace(/^(["'])(.*)\1$/, '$2').trim()

/** Configuration SMTP, ou null si les variables ne sont pas renseignées. */
export function smtpConfig() {
  const host = clean(process.env.SMTP_HOST)
  const user = clean(process.env.SMTP_USER)
  const pass = clean(process.env.SMTP_PASS).replace(/\s+/g, '')
  if (!host || !user || !pass) return null
  const port = Number(clean(process.env.SMTP_PORT)) || 465
  return {
    transport: { host, port, secure: port === 465, auth: { user, pass } },
    from: clean(process.env.DEVIS_EMAIL_FROM) || user,
    // Boîte qui reçoit les notifications internes (signatures…)
    notify: clean(process.env.DEVIS_NOTIFY_EMAIL) || user,
  }
}

// Message compréhensible selon l'erreur SMTP (nodemailer expose err.code).
export function smtpErrorMessage(err) {
  const code = err?.code || ''
  const resp = Number(err?.responseCode) || 0
  if (code === 'EAUTH' || resp === 535 || resp === 534) {
    return 'Identifiants refusés par le serveur mail. Avec Gmail, SMTP_PASS doit être un mot de passe d’application (16 caractères), pas le mot de passe du compte.'
  }
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'EDNS') {
    return 'Serveur mail injoignable : vérifie SMTP_HOST (smtp.gmail.com) et SMTP_PORT (465).'
  }
  if (code === 'EENVELOPE' || resp === 550 || resp === 553) {
    return 'Adresse refusée par le serveur mail : vérifie le destinataire et DEVIS_EMAIL_FROM.'
  }
  if (code === 'EMESSAGE' || resp === 552) return 'Message refusé par le serveur mail (pièce jointe trop lourde ?).'
  return 'L’envoi a échoué — vérifie la configuration SMTP.'
}

/** Envoie un mail avec la configuration SMTP. `from` par défaut. */
export async function sendMail(cfg, message) {
  const transporter = nodemailer.createTransport(cfg.transport)
  return transporter.sendMail({ from: cfg.from, ...message })
}
