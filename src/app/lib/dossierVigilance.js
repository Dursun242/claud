// Dossier de vigilance d'une entreprise (PDF, serveur, pdf-lib) : synthèse
// (identité, situation légale, état de chaque document, historique des
// dépôts et des demandes envoyées), puis les documents eux-mêmes en
// annexe. Sert de preuve de la vigilance du donneur d'ordre en cas de
// contrôle. Construit par /api/conformite (action « dossier »).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { DOC_KINDS, DOC_META, STATUS_META } from './conformite'
import { LEGAL_META } from './legalCheck'

const A4 = [595.28, 841.89]
const M = 48
const NAVY = rgb(0.12, 0.23, 0.37)
const GREY = rgb(0.39, 0.45, 0.55)
const TEXT = rgb(0.06, 0.09, 0.16)

// Polices standard (WinAnsi) : on remplace ce qu'elles ne savent pas écrire
export const winAnsi = (s) => String(s ?? '')
  .replace(/[‘’]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
  .replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/€/g, 'EUR').replace(/[  ]/g, ' ')
  .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')

const fmtD = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '')
const fmtDT = (v) => (v ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }).format(new Date(v)) : '')

function writer(pdf, fonts) {
  let page = null
  let y = 0
  const newPage = () => { page = pdf.addPage(A4); y = A4[1] - M }
  newPage()
  const wrap = (text, size, font, width) => {
    const words = winAnsi(text).split(/\s+/)
    const lines = []
    let cur = ''
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w
      if (font.widthOfTextAtSize(next, size) > width && cur) { lines.push(cur); cur = w } else cur = next
    }
    if (cur) lines.push(cur)
    return lines.length ? lines : ['']
  }
  const line = (text, { size = 10, bold = false, color = TEXT, indent = 0, gap = 3 } = {}) => {
    const font = bold ? fonts.bold : fonts.regular
    for (const l of wrap(text, size, font, A4[0] - 2 * M - indent)) {
      if (y - size < M) newPage()
      page.drawText(l, { x: M + indent, y: y - size, size, font, color })
      y -= size + gap
    }
  }
  const space = (h = 8) => { y -= h; if (y < M + 20) newPage() }
  const title = (text) => { space(6); line(text, { size: 13, bold: true, color: NAVY, gap: 6 }) }
  return { line, space, title, newPage: () => newPage(), get page() { return page } }
}

/**
 * @param {object} p
 * @param {object} p.contact      fiche contact
 * @param {object} p.compliance   lib/conformite.contactCompliance (5 documents)
 * @param {Array}  p.docs         tous les documents déposés (historique)
 * @param {Array}  p.requests     demandes envoyées (contact_doc_requests)
 * @param {object} [p.legal]      dernier contrôle légal (contact_legal_checks)
 * @param {Array}  [p.annexes]    [{ doc, bytes: Uint8Array, mediaType }] documents en cours de validité à joindre
 * @param {object} [p.company]    donneur d'ordre (lib/company.COMPANY)
 * @param {Date}   [p.now]
 * @returns {Promise<Uint8Array>}
 */
export async function buildDossierVigilance({ contact, compliance, docs = [], requests = [], legal = null, annexes = [], company = {}, now = new Date() }) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(winAnsi(`Dossier de vigilance - ${contact.societe || contact.nom}`))
  const fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) }
  const w = writer(pdf, fonts)

  w.line('DOSSIER DE VIGILANCE', { size: 18, bold: true, color: NAVY, gap: 4 })
  w.line(contact.societe || contact.nom, { size: 14, bold: true })
  w.line(`Établi le ${fmtDT(now)} par ${company.nom || 'le donneur d’ordre'}${company.siret ? ` (SIRET ${company.siret})` : ''}`, { size: 9, color: GREY })

  w.title('Entreprise')
  const ident = [
    ['Raison sociale', contact.societe || contact.nom],
    ['Contact', contact.societe && contact.nom !== contact.societe ? contact.nom : ''],
    ['SIRET', contact.siret],
    ['Adresse', [contact.adresse, contact.code_postal, contact.ville].filter(Boolean).join(' ')],
    ['Email / téléphone', [contact.email, contact.tel || contact.tel_fixe].filter(Boolean).join(' · ')],
    ['Activité', contact.specialite],
  ]
  for (const [k, v] of ident) if (v) w.line(`${k} : ${v}`)

  w.title('Situation légale (contrôle automatique)')
  if (legal) {
    w.line(`${LEGAL_META[legal.statut]?.label || legal.statut} : ${legal.libelle || ''}`, { bold: legal.statut !== 'ok' })
    w.line(`Contrôlé le ${fmtDT(legal.checked_at)} auprès de l’annuaire des entreprises (État) et du BODACC.`, { size: 9, color: GREY })
  } else {
    w.line('Aucun contrôle enregistré.', { color: GREY })
  }

  w.title('Documents (état au jour de l’édition)')
  for (const kind of DOC_KINDS) {
    const k = compliance.kinds[kind]
    const d = k.doc
    w.line(`${DOC_META[kind].long} : ${STATUS_META[k.status].label}`, { bold: true, gap: 2 })
    if (d) {
      const parts = [
        d.date_document ? `document du ${fmtD(d.date_document)}` : null,
        k.valideAu ? `valable jusqu’au ${fmtD(k.valideAu)}` : (DOC_META[kind].sansExpiration ? 'sans date de validité' : null),
        `déposé le ${fmtD(d.created_at)} par ${d.depose_par === 'entreprise' ? 'l’entreprise' : 'l’équipe'}`,
        d.file_name ? `fichier ${d.file_name}` : null,
      ].filter(Boolean)
      w.line(parts.join(' · '), { size: 9, indent: 12, color: GREY })
      if (kind === 'decennale' && (d.assureur || d.numero_police)) w.line(`Assureur : ${[d.assureur, d.numero_police].filter(Boolean).join(' - ')}${d.activites ? ` · Activités : ${d.activites}` : ''}`, { size: 9, indent: 12, color: GREY })
      if (kind === 'urssaf' && d.code_securite) w.line(`Code de sécurité : ${d.code_securite}`, { size: 9, indent: 12, color: GREY })
      for (const a of d.anomalies || []) w.line(`! ${a}`, { size: 9, indent: 12, color: rgb(0.76, 0.25, 0.05) })
    } else {
      w.line('Aucun document déposé.', { size: 9, indent: 12, color: GREY })
    }
    w.space(3)
  }

  w.title('Historique des dépôts')
  const hist = [...docs].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  if (!hist.length) w.line('Aucun dépôt.', { color: GREY })
  for (const d of hist.slice(0, 40)) {
    w.line(`${fmtDT(d.created_at)} - ${DOC_META[d.kind]?.label || d.kind} - ${d.file_name || ''} (${d.depose_par === 'entreprise' ? 'entreprise' : 'équipe'})`, { size: 9 })
  }

  w.title('Demandes envoyées à l’entreprise')
  if (!requests.length) w.line('Aucune demande envoyée.', { color: GREY })
  for (const r of [...requests].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))) {
    w.line(`Lien créé le ${fmtDT(r.created_at)}${r.email ? ` pour ${r.email}` : ''} · ${r.envois || 0} envoi${(r.envois || 0) > 1 ? 's' : ''}, dernier le ${fmtDT(r.dernier_envoi)}${r.auto ? ' (relances automatiques)' : ''} · ${r.derniere_visite ? `lien ouvert le ${fmtDT(r.derniere_visite)}` : 'lien non ouvert'}`, { size: 9 })
  }

  w.space(10)
  w.line('Dossier établi à partir des pièces fournies par l’entreprise (ou déposées par l’équipe), lues automatiquement puis contrôlées. Les documents en cours sont joints en annexe.', { size: 8, color: GREY })

  // Annexes : une page de garde par document, puis le document
  let n = 0
  for (const { doc, bytes, mediaType } of annexes) {
    n += 1
    const label = `Annexe ${n} - ${DOC_META[doc.kind]?.long || doc.kind}${doc.file_name ? ` (${doc.file_name})` : ''}`
    try {
      if (mediaType === 'application/pdf') {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const pages = await pdf.copyPages(src, src.getPageIndices())
        pages.forEach((p, i) => {
          pdf.addPage(p)
          if (i === 0) p.drawText(winAnsi(label), { x: 16, y: 10, size: 7, font: fonts.regular, color: GREY })
        })
      } else {
        const img = mediaType === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
        const page = pdf.addPage(A4)
        const max = [A4[0] - 2 * M, A4[1] - 2 * M - 20]
        const scale = Math.min(max[0] / img.width, max[1] / img.height, 1)
        page.drawText(winAnsi(label), { x: M, y: A4[1] - M + 6, size: 9, font: fonts.bold, color: NAVY })
        page.drawImage(img, { x: M, y: A4[1] - M - 10 - img.height * scale, width: img.width * scale, height: img.height * scale })
      }
    } catch {
      const page = pdf.addPage(A4)
      page.drawText(winAnsi(label), { x: M, y: A4[1] - M, size: 11, font: fonts.bold, color: NAVY })
      page.drawText(winAnsi('Document joint illisible ou protégé : voir le fichier d’origine dans l’application.'), { x: M, y: A4[1] - M - 20, size: 9, font: fonts.regular, color: GREY })
    }
  }
  return pdf.save()
}
