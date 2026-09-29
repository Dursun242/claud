/**
 * Mail de devis au format HTML (charte ID Maîtrise) : en-tête, message saisi
 * dans la fenêtre d'envoi, bouton de signature en ligne, liste des pièces
 * jointes et pied de page société. Mise en page en tableaux + styles en
 * ligne (compatibilité Gmail / Outlook). La version texte reste envoyée en
 * parallèle. Logique pure, testée dans __tests__/devisMailHtml.test.js.
 */

const NAVY = '#1E3A5F'
const ACCENT = '#C8A45C'
const TEXT = '#1F2937'
const MUTED = '#64748B'
const FONT = "'Segoe UI', Helvetica, Arial, sans-serif"

export const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g

/** Texte saisi → paragraphes HTML (retours à la ligne conservés, liens cliquables). */
export function textToHtml(text) {
  return String(text || '').replace(/\r\n?/g, '\n').trim().split(/\n{2,}/).map(par => {
    const lines = par.split('\n').map(line => {
      let out = ''
      let last = 0
      for (const m of line.matchAll(URL_RE)) {
        out += escapeHtml(line.slice(last, m.index))
        out += `<a href="${escapeHtml(m[0])}" style="color:${NAVY};">${escapeHtml(m[0])}</a>`
        last = m.index + m[0].length
      }
      return out + escapeHtml(line.slice(last))
    })
    return `<p style="margin:0 0 14px;">${lines.join('<br>')}</p>`
  }).join('\n')
}

/** Lien de signature accepté (page /signer/<jeton> de l'application). */
export function isSignUrl(url) {
  return /^https?:\/\/[a-z0-9.-]+(:\d+)?\/signer\/[0-9a-f]{64}$/i.test(String(url || ''))
}

/**
 * @param {object} p
 * @param {string} p.body         message saisi (texte)
 * @param {string} [p.signUrl]    lien de signature en ligne
 * @param {string[]} [p.attachments] noms des pièces jointes
 * @param {object} p.company      COMPANY (lib/company.js)
 * @param {string} [p.title]      titre (objet du mail) pour l'aperçu
 * @param {string} [p.logoSrc]    image du logo (ex. « cid:… ») ; sans logo : en-tête texte
 * @param {string} [p.trackUrl]   image de suivi des ouvertures (1×1, invisible)
 */
export function devisMailHtml({ body, signUrl, attachments = [], company = {}, title = '', logoSrc = '', trackUrl = '' }) {
  const header = logoSrc
    ? `<tr><td style="background:#FFFFFF;padding:22px 32px 16px;">
          <img src="${escapeHtml(logoSrc)}" width="280" height="79" alt="${escapeHtml(company.nom || 'ID Maîtrise')}" style="display:block;width:280px;max-width:100%;height:auto;border:0;">
        </td></tr>
        <tr><td style="height:4px;background:${NAVY};font-size:0;line-height:0;">&nbsp;</td></tr>`
    : `<tr><td style="background:${NAVY};padding:22px 32px;">
          <div style="font-size:20px;font-weight:700;letter-spacing:.08em;color:#FFFFFF;">ID MAÎTRISE</div>
          <div style="font-size:12px;color:#CBD5E1;margin-top:2px;">${escapeHtml(company.activite || 'Maîtrise d’œuvre')}</div>
        </td></tr>`
  const sign = signUrl && isSignUrl(signUrl) ? `
          <tr><td style="padding:6px 32px 26px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;width:100%;">
              <tr><td style="padding:18px 20px;text-align:center;">
                <div style="font-size:14px;color:${TEXT};margin-bottom:12px;">Vous pouvez consulter et signer ce devis en ligne (bon pour accord) :</div>
                <a href="${escapeHtml(signUrl)}" style="display:inline-block;background:${NAVY};color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 26px;border-radius:8px;">✍️&nbsp; Consulter et signer le devis</a>
                <div style="font-size:11px;color:${MUTED};margin-top:10px;">Signature électronique sécurisée, sans création de compte.</div>
              </td></tr>
            </table>
          </td></tr>` : ''
  const files = attachments.filter(Boolean)
  const pj = files.length ? `
          <tr><td style="padding:0 32px 24px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};margin-bottom:6px;">Pièces jointes</div>
            ${files.map(n => `<div style="font-size:13px;color:${TEXT};padding:3px 0;">📎 ${escapeHtml(n)}</div>`).join('\n            ')}
          </td></tr>` : ''
  const footer = [
    company.nom && `<strong style="color:${NAVY};">${escapeHtml(company.nom)}</strong>${company.activite ? ` · ${escapeHtml(company.activite)}` : ''}`,
    [company.adresse, company.cpVille].filter(Boolean).map(escapeHtml).join(', '),
    company.email && `<a href="mailto:${escapeHtml(company.email)}" style="color:${MUTED};">${escapeHtml(company.email)}</a>`,
    [company.siret && `SIRET ${escapeHtml(company.siret)}`, company.assurance && escapeHtml(company.assurance)].filter(Boolean).join(' · '),
  ].filter(Boolean).join('<br>')

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F5F9;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:12px;overflow:hidden;font-family:${FONT};">
        ${header}
        <tr><td style="height:3px;background:${ACCENT};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:28px 32px 10px;font-size:15px;line-height:1.6;color:${TEXT};">
${textToHtml(body)}
        </td></tr>${sign}${pj}
        <tr><td style="padding:18px 32px;background:#F8FAFC;border-top:1px solid #E2E8F0;font-size:12px;line-height:1.6;color:${MUTED};">
          ${footer}
        </td></tr>
      </table>${trackUrl ? `
      <img src="${escapeHtml(trackUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;">` : ''}
    </td></tr>
  </table>
</body></html>`
}
