// Mail du matin (« Vos priorités du jour ») : heure de Paris et mise en
// forme du mail (HTML + texte). Logique pure, utilisée par
// /api/cron/daily-digest et testée avec elle.

import { escapeHtml } from './devisMailHtml'

const NAVY = '#1E3A5F'
const ACCENT = '#C8A45C'
const TEXT = '#1F2937'
const MUTED = '#64748B'
const FONT = "'Segoe UI', Helvetica, Arial, sans-serif"

export const TIME_ZONE = 'Europe/Paris'
export const SEND_HOUR = 7
export const REST_LIMIT = 10

/**
 * Date et heure à Paris (heure d'été / d'hiver gérées par Intl).
 * @returns {{ today: string, hm: string, hour: number, weekday: number, label: string }}
 *   today AAAA-MM-JJ, hm HH:MM, weekday 1 (lundi) … 7 (dimanche),
 *   label « lundi 5 octobre »
 */
export function parisClock(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date).map(p => [p.type, p.value]))
  const weekday = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[parts.weekday] || 0
  const label = new Intl.DateTimeFormat('fr-FR', {
    timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long',
  }).format(date)
  return {
    today: `${parts.year}-${parts.month}-${parts.day}`,
    hm: `${parts.hour}:${parts.minute}`,
    hour: Number(parts.hour),
    weekday,
    label,
  }
}

const points = (n) => `${n} point${n > 1 ? 's' : ''}`
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/**
 * @param {object} p
 * @param {{ top: object[], rest: object[], total: number }} p.priorities
 * @param {string} p.dateLabel   « lundi 5 octobre »
 * @param {string} [p.mot]       mot du jour (IA), facultatif
 * @param {string} [p.appUrl]    lien « Ouvrir le tableau de bord »
 * @param {number} [p.restLimit] nombre d'éléments dans « Également à traiter »
 * @returns {{ subject: string, text: string, html: string }}
 */
export function buildDigestMail({ priorities, dateLabel, mot = '', appUrl = '', restLimit = REST_LIMIT }) {
  const { top = [], rest = [], total = 0 } = priorities || {}
  const subject = oneLine(`Vos priorités du ${dateLabel} — ${points(total)}`)
  const also = rest.slice(0, restLimit)
  const more = total - top.length - also.length
  const moreLine = more > 0 ? `… et ${points(more)} de plus sur le tableau de bord.` : ''
  const url = /^https?:\/\//i.test(appUrl) ? appUrl : ''

  // ─── Texte brut ───
  const text = [
    `Vos priorités du ${dateLabel}`,
    mot ? `\n${oneLine(mot)}` : null,
    '',
    ...top.flatMap((p, i) => [
      `${i + 1}. ${oneLine(p.title)}`,
      `   ${oneLine(p.reason)}`,
      p.sub ? `   ${oneLine(p.sub)}` : null,
    ]),
    ...(also.length ? ['', 'Également à traiter :', ...also.map(p => `- ${oneLine(p.title)} — ${oneLine(p.reason)}`)] : []),
    moreLine ? moreLine : null,
    url ? `\nOuvrir le tableau de bord : ${url}` : null,
  ].filter(l => l !== null).join('\n')

  // ─── HTML (tableaux + styles en ligne, lisible sur téléphone) ───
  const topHtml = top.map((p, i) => `
          <tr><td style="padding:0 24px 14px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E2E8F0;border-radius:10px;">
              <tr>
                <td width="34" valign="top" style="padding:14px 0 14px 14px;">
                  <div style="width:26px;height:26px;line-height:26px;border-radius:13px;background:${NAVY};color:#FFFFFF;font-weight:700;font-size:13px;text-align:center;">${i + 1}</div>
                </td>
                <td valign="top" style="padding:12px 14px 12px 10px;font-size:15px;line-height:1.45;color:${TEXT};">
                  <strong>${escapeHtml(oneLine(p.title))}</strong>
                  <div style="font-size:14px;color:${TEXT};margin-top:2px;">${escapeHtml(oneLine(p.reason))}</div>${p.sub ? `
                  <div style="font-size:13px;color:${MUTED};margin-top:2px;">${escapeHtml(oneLine(p.sub))}</div>` : ''}
                </td>
              </tr>
            </table>
          </td></tr>`).join('')
  const alsoHtml = also.length ? `
          <tr><td style="padding:6px 24px 4px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};margin-bottom:6px;">Également à traiter</div>
            ${also.map(p => `<div style="font-size:14px;line-height:1.45;color:${TEXT};padding:5px 0;border-bottom:1px solid #F1F5F9;">${escapeHtml(oneLine(p.title))} <span style="color:${MUTED};">— ${escapeHtml(oneLine(p.reason))}</span></div>`).join('\n            ')}${moreLine ? `
            <div style="font-size:13px;color:${MUTED};padding:8px 0 0;">${escapeHtml(moreLine)}</div>` : ''}
          </td></tr>` : ''
  const button = url ? `
          <tr><td align="center" style="padding:20px 24px 26px;">
            <a href="${escapeHtml(url)}" style="display:inline-block;background:${NAVY};color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 26px;border-radius:8px;">Ouvrir le tableau de bord</a>
          </td></tr>` : '<tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>'

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F5F9;">
    <tr><td align="center" style="padding:16px 8px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:12px;overflow:hidden;font-family:${FONT};">
        <tr><td style="background:${NAVY};padding:18px 24px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#CBD5E1;">ID MAÎTRISE</div>
          <div style="font-size:19px;font-weight:700;color:#FFFFFF;margin-top:4px;">Vos priorités du ${escapeHtml(dateLabel)}</div>
        </td></tr>
        <tr><td style="height:3px;background:${ACCENT};font-size:0;line-height:0;">&nbsp;</td></tr>${mot ? `
        <tr><td style="padding:18px 24px 4px;font-size:15px;line-height:1.55;color:${TEXT};font-style:italic;">${escapeHtml(oneLine(mot))}</td></tr>` : ''}
        <tr><td style="padding:16px 24px 8px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};">Par quoi commencer</td></tr>${topHtml}${alsoHtml}${button}
      </table>
    </td></tr>
  </table>
</body></html>`

  return { subject, text, html }
}
