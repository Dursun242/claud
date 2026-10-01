'use client'
import { LOGO_B64 } from './logo'
import { COMPANY as ENT, SB } from './dashboards/shared'
import { crTaskStats, daysLate, fmtLongDate, isoWeek, priorityLabel, globalProgress, lotOf, lotKey, GENERAL } from './lib/crSuivi'

// Lazy-load jsPDF + plugin autotable : évite de charger ~180 KB au démarrage
// de l'app. La promesse est mise en cache pour éviter les imports répétés.
//
// ⚠️ Depuis jspdf 4.x, le constructor est exporté en NAMED export `jsPDF`.
// Depuis jspdf-autotable 5.x, on doit importer la fonction explicitement
// et l'appeler via `autoTable(doc, options)` au lieu de `doc.autoTable(options)`.
let _jsPdfPromise = null
function loadJsPdf() {
  if (!_jsPdfPromise) {
    _jsPdfPromise = Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]).then(([jsPdfModule, autoTableModule]) => ({
      jsPDF: jsPdfModule.jsPDF || jsPdfModule.default,
      autoTable: autoTableModule.default,
    }))
  }
  return _jsPdfPromise
}

// Palette couleurs ID Maîtrise
const BLEU = [30, 58, 95]
const BLEU_CLAIR = [59,130,246]
const GRIS = [100,116,139]
const GRIS_CLAIR = [241,245,249]
const NOIR = [15,23,42]

// Sanitise text for jsPDF built-in helvetica font (Latin-1 only)
// Characters outside ISO-8859-1 (like curly quotes, œ, æ…) corrupt entire lines
const sanitize = (str) => {
  if (!str) return ""
  return str
    .replace(/[\u2018\u2019\u201A\u201B\u02BC]/g, "'")   // curly single quotes → '
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')           // curly double quotes → "
    .replace(/\u2013/g, '-')                               // en dash
    .replace(/\u2014/g, '--')                              // em dash
    .replace(/\u2026/g, '...')                             // ellipsis
    .replace(/\u0153/g, 'oe')                              // œ → oe
    .replace(/\u0152/g, 'OE')                              // Œ → OE
    .replace(/\u00e6/g, 'ae')                              // æ → ae
    .replace(/\u00c6/g, 'AE')                              // Æ → AE
    .replace(/\u0300|\u0301|\u0302|\u0303|\u0308/g, '')    // strip combining accents
    .replace(/[^\x00-\xFF]/g, '?')                         // any remaining non-Latin-1 → ?
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')    // strip ASCII control chars (corrupt PDFs)
}

const fmtD = (d) => {
  if (!d) return "—"
  try { return new Date(d).toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric" }) }
  catch { return d }
}

const fmtM = (n) => {
  const num = Number(n) || 0
  // Format manually to avoid non-breaking spaces that jsPDF renders as "/"
  const fixed = Math.abs(num).toFixed(2)
  const [whole, dec] = fixed.split(".")
  // Add thousand separators with regular spaces
  const withSep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  return (num < 0 ? "-" : "") + withSep + "," + dec + " \u20AC"
}

// ══════════════════════════════════════
// GÉNÉRATEUR PDF — PROCÈS-VERBAL DE RÉCEPTION
// ══════════════════════════════════════
export async function generatePVPdf(pvData) {
  const { jsPDF, autoTable } = await loadJsPdf()
  const doc = new jsPDF('p', 'mm', 'a4')
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  const margin = 18
  const usable = w - margin * 2

  let y = 12

  // === EN-TÊTE ===
  try { doc.addImage(LOGO_B64, 'JPEG', margin, y - 5, 48, 14) } catch(e) {}

  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...BLEU)
  doc.text("PROCÈS-VERBAL", w - margin, y, { align: "right" })
  doc.setFontSize(11)
  doc.setTextColor(...BLEU_CLAIR)
  doc.text("DE RÉCEPTION", w - margin, y + 6, { align: "right" })
  doc.setFontSize(12)
  doc.text(pvData.numero || "PV-XXXX-000", w - margin, y + 11, { align: "right" })

  // Infos entreprise
  y = 24
  doc.setFontSize(7)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...GRIS)
  doc.text(`${ENT.adresse}, ${ENT.cpVille} — SIRET: ${ENT.siret}`, margin, y)
  doc.text(`${ENT.email} — ${ENT.assurance}`, margin, y + 3.5)

  // Séparateur
  y = 31
  doc.setDrawColor(...BLEU)
  doc.setLineWidth(0.7)
  doc.line(margin, y, w - margin, y)
  y += 6

  // === CHANTIER ===
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...BLEU)
  doc.text("CHANTIER", margin, y)
  y += 4
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...NOIR)
  doc.text(pvData.chantierNom || "—", margin, y)
  y += 4
  doc.setFontSize(7.5)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...GRIS)
  doc.text(pvData.chantierAdresse || "", margin, y)
  y += 8

  // === MAÎTRE(S) D'OUVRAGE ===
  // Jusqu'à 3 signataires MOA (ex : co-propriétaires), un par ligne.
  // Rétrocompat : accepte aussi l'ancien champ singulier signataireMotEmail.
  const moaEmails = pvData.signataireMotEmails?.length
    ? pvData.signataireMotEmails
    : (pvData.signataireMotEmail ? [pvData.signataireMotEmail] : [])
  const moaBoxHeight = Math.max(12, 5 + moaEmails.length * 4.5)
  doc.setFillColor(...GRIS_CLAIR)
  doc.roundedRect(margin, y, usable, moaBoxHeight, 1.5, 1.5, 'F')
  doc.setFontSize(7.5)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...BLEU)
  doc.text(moaEmails.length > 1 ? "MAÎTRES D'OUVRAGE" : "MAÎTRE D'OUVRAGE", margin + 3, y + 5)
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...NOIR)
  if (moaEmails.length > 0) {
    moaEmails.forEach((email, idx) => doc.text(sanitize(email), margin + 3, y + 9.5 + idx * 4.5))
  } else {
    doc.text("—", margin + 3, y + 9.5)
  }
  y += moaBoxHeight + 5

  // === ENTREPRISE(S) / INTERVENANT(S) ===
  // Tableau (plutôt qu'un bloc de texte empilé) pour rester lisible même
  // avec plusieurs intervenants sélectionnés sur le même PV.
  const intervenants = pvData.selectedIntervenants || []
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...BLEU)
  doc.text(intervenants.length > 1 ? "ENTREPRISES / INTERVENANTS" : "ENTREPRISE / INTERVENANT", margin, y)
  y += 4

  if (intervenants.length > 0) {
    const body = intervenants.map((it, idx) => [
      String(idx + 1),
      sanitize(it.nom || "—"),
      sanitize(it.societe || "—"),
      it.email || "—",
      it.tel || "—",
    ])
    autoTable(doc, {
      startY: y,
      head: [["N°", "Nom", "Entreprise", "Email", "Téléphone"]],
      body,
      margin: { left: margin, right: margin },
      headStyles: { fillColor: BLEU, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, textColor: NOIR },
      alternateRowStyles: { fillColor: GRIS_CLAIR },
      columnStyles: {
        0: { cellWidth: usable * 0.06, halign: 'center' },
        1: { cellWidth: usable * 0.24 },
        2: { cellWidth: usable * 0.28 },
        3: { cellWidth: usable * 0.28 },
        4: { cellWidth: usable * 0.14 },
      },
      styles: { lineWidth: 0.2, lineColor: [226, 232, 240] },
    })
    y = doc.lastAutoTable.finalY + 6
  } else {
    // Rétrocompatibilité : ancien format à un seul intervenant
    // (signataireEntrepriseEmail / entrepriseXxx directement sur pvData).
    const entrepriseNom = pvData.entrepriseSociete || pvData.signataireEntrepriseEmail || "—"
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...NOIR)
    doc.text(sanitize(entrepriseNom), margin, y)
    y += 4

    const coordParts = [
      pvData.entrepriseAdresse,
      [pvData.entrepriseCP, pvData.entrepriseVille].filter(Boolean).join(' '),
      pvData.entrepriseTel && `Tel: ${pvData.entrepriseTel}`,
      pvData.entrepriseEmail,
      pvData.entrepriseSiret && `SIRET: ${pvData.entrepriseSiret}`,
    ].filter(Boolean)
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...GRIS)
    doc.text(sanitize(coordParts.join('  •  ')), margin, y)
    y += 8
  }

  // === INFO TRAVAUX ===
  if (y > 240) { doc.addPage(); y = 20 }
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...BLEU)
  doc.text("OBJET DU PROCÈS-VERBAL", margin, y)
  y += 5

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...NOIR)
  const titleLines = doc.splitTextToSize(sanitize(pvData.titre || ""), usable)
  doc.text(titleLines, margin, y)
  y += titleLines.length * 4 + 3

  if (pvData.description) {
    doc.setFontSize(8.5)
    doc.setTextColor(...GRIS)
    const descLines = doc.splitTextToSize(sanitize(pvData.description), usable)
    doc.text(descLines, margin, y)
    y += descLines.length * 3.5 + 5
  }

  // === DÉCISION ===
  if (pvData.decision) {
    y += 3
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...BLEU)
    doc.text("DÉCISION", margin, y)
    y += 5

    const decisionEmoji = {
      'Accepté': '✓',
      'Accepté avec réserve': '⚠',
      'Refusé': '✕'
    }
    const decisionColors = {
      'Accepté': [34, 139, 34],
      'Accepté avec réserve': [255, 140, 0],
      'Refusé': [220, 20, 60]
    }

    const emoji = decisionEmoji[pvData.decision] || '•'
    const dColor = decisionColors[pvData.decision] || NOIR

    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...dColor)
    doc.text(`${emoji}  ${pvData.decision}`, margin, y)
    y += 6

    if (pvData.decision === 'Accepté avec réserve' && pvData.reservesAcceptation) {
      doc.setFontSize(8.5)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(...NOIR)
      doc.text("Réserves :", margin, y)
      y += 3
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8)
      doc.setTextColor(...GRIS)
      const resLines = doc.splitTextToSize(sanitize(pvData.reservesAcceptation), usable)
      doc.text(resLines, margin, y)
      y += resLines.length * 3.5 + 3
    }

    if (pvData.decision === 'Refusé' && pvData.motifRefus) {
      doc.setFontSize(8.5)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(...NOIR)
      doc.text("Motif du refus :", margin, y)
      y += 3
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8)
      doc.setTextColor(...GRIS)
      const motifLines = doc.splitTextToSize(sanitize(pvData.motifRefus), usable)
      doc.text(motifLines, margin, y)
      y += motifLines.length * 3.5 + 3
    }
  }

  // === SIGNATURES ===
  y += 8
  if (y > 260) { doc.addPage(); y = 20 }

  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...BLEU)
  doc.text("SIGNATURES", margin, y)
  y += 6

  // Une étiquette par signataire réel (MOE, MOA×N, Entreprise×N), 3 par
  // ligne — reflète les vraies zones de signature Odoo (voir lib/odoo.js)
  // au lieu d'un fixe "Maître d'œuvre / Maître d'ouvrage / Entreprise".
  const signerLabels = [
    "Maître d'œuvre",
    ...moaEmails.map((_, i) => moaEmails.length > 1 ? `Maître d'ouvrage ${i + 1}` : "Maître d'ouvrage"),
    ...intervenants.map((it, i) => intervenants.length > 1 ? `Entreprise ${i + 1}` : "Entreprise"),
  ]
  const signPerRow = 3
  const signColW = usable / signPerRow - 1
  doc.setFontSize(8)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...NOIR)
  signerLabels.forEach((label, i) => {
    const row = Math.floor(i / signPerRow)
    const col = i % signPerRow
    const sx = margin + col * (signColW + 3)
    const sy = y + row * 7
    doc.text(label, sx, sy)
  })
  y += (Math.ceil(signerLabels.length / signPerRow) - 1) * 7

  // Pied de page
  pied(doc, w, margin, h - 12)

  return doc
}

function pied(doc, w, margin, y) {
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.2)
  doc.line(margin, y, w - margin, y)
  y += 3
  doc.setFontSize(6)
  doc.setTextColor(148, 163, 184)
  doc.text(
    `${ENT.nom} — ${ENT.adresse}, ${ENT.cpVille} — SIRET ${ENT.siret} — ${ENT.assurance}`,
    w / 2, y, { align: "center" }
  )
}

// ══════════════════════════════════════
// GÉNÉRATEUR PDF — ORDRE DE SERVICE
// ══════════════════════════════════════
export async function generateOSPdf(data) {
  const { jsPDF, autoTable } = await loadJsPdf()
  const doc = new jsPDF('p', 'mm', 'a4')
  const w = doc.internal.pageSize.getWidth()
  const margin = 18
  const usable = w - margin * 2

  // Logo (left side)
  let y = 12
  try { doc.addImage(LOGO_B64, 'JPEG', margin, y - 5, 48, 14) } catch(e) {}
  
  // Titre ORDRE DE SERVICE (right side, same height as logo)
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...BLEU)
  doc.text("ORDRE DE SERVICE", w - margin, y, { align: "right" })
  doc.setFontSize(12)
  doc.setTextColor(...BLEU_CLAIR)
  doc.text(data.numero || "OS-XXXX", w - margin, y + 6, { align: "right" })

  // Infos entreprise sous le logo
  y = 24
  doc.setFontSize(7)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...GRIS)
  doc.text(`${ENT.adresse}, ${ENT.cpVille} — SIRET: ${ENT.siret}`, margin, y)
  doc.text(`${ENT.email} — ${ENT.assurance}`, margin, y + 3.5)

  // Ligne séparatrice
  y = 31
  doc.setDrawColor(...BLEU); doc.setLineWidth(0.7)
  doc.line(margin, y, w - margin, y); y += 5

  // Dates
  doc.setFillColor(...GRIS_CLAIR)
  doc.roundedRect(margin, y, usable, 9, 1.5, 1.5, 'F')
  doc.setFontSize(7.5); doc.setTextColor(...NOIR)
  const c3 = usable / 3
  doc.setFont("helvetica", "bold"); doc.text("Émission : ", margin + 3, y + 6)
  doc.setFont("helvetica", "normal"); doc.text(fmtD(data.date_emission), margin + 23, y + 6)
  doc.setFont("helvetica", "bold"); doc.text("Intervention : ", margin + c3 + 3, y + 6)
  doc.setFont("helvetica", "normal"); doc.text(fmtD(data.date_intervention), margin + c3 + 28, y + 6)
  doc.setFont("helvetica", "bold"); doc.text("Fin prévue : ", margin + c3 * 2 + 3, y + 6)
  doc.setFont("helvetica", "normal"); doc.text(fmtD(data.date_fin_prevue), margin + c3 * 2 + 25, y + 6)
  y += 14

  // Chantier
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
  doc.text("CHANTIER", margin, y); y += 4
  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...NOIR)
  doc.text(data.chantier || "—", margin, y); y += 4
  doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS)
  doc.text(data.adresse_chantier || "", margin, y); y += 7

  // Client + Artisan
  const halfW = (usable - 4) / 2
  doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3)
  doc.rect(margin, y, halfW, 26)
  doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
  doc.text("MAÎTRE D'OUVRAGE", margin + 3, y + 5)
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...NOIR)
  doc.text(data.client_nom || "—", margin + 3, y + 10)
  doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS)
  doc.text(data.client_adresse || "", margin + 3, y + 15)

  const ax = margin + halfW + 4
  doc.rect(ax, y, halfW, 26)
  doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
  doc.text("ENTREPRISE", ax + 3, y + 5)

  // Nom principal en gros : on privilégie la société si elle est connue,
  // sinon on retombe sur le nom de l'interlocuteur (rétrocompat).
  const hasSociete = data.artisan_societe && String(data.artisan_societe).trim()
  const mainName = hasSociete ? data.artisan_societe : (data.artisan_nom || "—")
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...NOIR)
  doc.text(sanitize(mainName), ax + 3, y + 10)

  // Lignes secondaires (petites) : si société connue et nom différent,
  // on affiche l'interlocuteur en premier. Sinon on garde l'ancien layout.
  doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS)
  const aLines = [
    hasSociete && data.artisan_nom && sanitize(data.artisan_nom) !== sanitize(data.artisan_societe)
      ? `Interlocuteur : ${data.artisan_nom}`
      : null,
    data.artisan_specialite,
    `Tél: ${data.artisan_tel || ""}`,
    `SIRET: ${data.artisan_siret || ""}`,
  ].filter(Boolean)
  // Espacement adapté : 3.2 pour 3 lignes ou moins, 2.8 pour 4 lignes
  // afin de rester dans la boîte de 26 d'hauteur.
  const lineGap = aLines.length > 3 ? 2.8 : 3.2
  aLines.forEach((l, i) => doc.text(sanitize(l), ax + 3, y + 14 + i * lineGap))
  y += 32

  // Prestations
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
  doc.text("DÉTAIL DES PRESTATIONS", margin, y); y += 3

  const prestations = data.prestations || []
  const tvaNA = !!data.tva_non_applicable
  let totalHT = 0; const tvaMap = {}
  const tbody = prestations.map(p => {
    const q = parseFloat(p.quantite)||0, pu = parseFloat(p.prix_unitaire)||0
    const tva = tvaNA ? 0 : (parseFloat(p.tva_taux)||20)
    const lht = q * pu; totalHT += lht
    tvaMap[tva] = (tvaMap[tva]||0) + lht * tva / 100
    return [sanitize(p.description)||"", p.unite||"", q.toString(), fmtM(pu), `${tva}%`, fmtM(lht)]
  })
  const totalTVA = Object.values(tvaMap).reduce((s, v) => s + v, 0)
  const totalTTC = totalHT + totalTVA

  autoTable(doc, {
    startY: y, head: [["Description", "Unité", "Qté", "PU HT", "TVA", "Total HT"]], body: tbody,
    margin: { left: margin, right: margin },
    headStyles: { fillColor: BLEU, textColor: [255,255,255], fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: NOIR },
    alternateRowStyles: { fillColor: GRIS_CLAIR },
    columnStyles: {
      0:{cellWidth:usable*0.44},
      1:{cellWidth:usable*0.09,halign:'center'},
      2:{cellWidth:usable*0.07,halign:'center'},
      3:{cellWidth:usable*0.14,halign:'right'},
      4:{cellWidth:usable*0.09,halign:'center'},
      5:{cellWidth:usable*0.17,halign:'right'}
    },
    styles: { lineWidth: 0.2, lineColor: [226,232,240] },
  })
  y = doc.lastAutoTable.finalY + 3

  // Totaux
  const tx = margin + usable * 0.55
  doc.setDrawColor(...BLEU); doc.setLineWidth(0.3); doc.line(tx, y, w - margin, y); y += 4
  doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...NOIR)
  doc.text("Total HT", tx, y); doc.text(fmtM(totalHT), w - margin, y, { align: "right" }); y += 4
  doc.setFont("helvetica", "normal")
  Object.entries(tvaMap).sort().forEach(([t, m]) => {
    doc.text(`TVA ${t}%`, tx, y)
    doc.text(fmtM(m), w - margin, y, { align: "right" })
    y += 4
  })
  doc.setDrawColor(...BLEU); doc.setLineWidth(0.5); doc.line(tx, y, w - margin, y); y += 1
  doc.setFillColor(238, 242, 255); doc.rect(tx, y, usable * 0.45, 7, 'F'); y += 5
  doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
  doc.text("TOTAL TTC", tx + 2, y); doc.text(fmtM(totalTTC), w - margin - 2, y, { align: "right" }); y += 8

  // Mention légale auto-entrepreneur en franchise de base de TVA (art. 293 B du CGI)
  if (tvaNA) {
    doc.setFontSize(8); doc.setFont("helvetica", "italic"); doc.setTextColor(...GRIS)
    doc.text("TVA non applicable, art. 293 B du CGI.", margin, y); y += 6
    doc.setFont("helvetica", "normal")
  }

  // Observations
  if (data.observations) {
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
    doc.text("OBSERVATIONS", margin, y); y += 4
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...NOIR)
    const ol = doc.splitTextToSize(sanitize(data.observations), usable)
    doc.text(ol, margin, y); y += ol.length * 3.2 + 4
  }

  // Conditions
  if (data.conditions) {
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
    doc.text("CONDITIONS", margin, y); y += 4
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...NOIR)
    const cl = doc.splitTextToSize(sanitize(data.conditions), usable); doc.text(cl, margin, y); y += cl.length * 3.2 + 6
  }

  // Signatures
  if (y > 245) { doc.addPage(); y = 20 }
  doc.setDrawColor(226,232,240); doc.setLineWidth(0.3); doc.line(margin, y, w - margin, y); y += 5
  const sw = (usable - 6) / 3
  ;[
    { t:"Le Maître d'œuvre", n:ENT.nom },
    { t:"L'Entreprise", n:data.artisan_nom||"" },
    { t:"Le Maître d'ouvrage", n:data.client_nom||"" }
  ].forEach((s, i) => {
    const sx = margin + i * (sw + 3); doc.rect(sx, y, sw, 24)
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...NOIR); doc.text(s.t, sx + 2, y + 4)
    doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS); doc.text(s.n, sx + 2, y + 8)
    doc.setFontSize(6.5); doc.text("Date et signature :", sx + 2, y + 21)
  })
  y += 30
  pied(doc, w, margin, y)
  if (data.returnBase64) {
    return { totalHT, totalTVA, totalTTC, base64: doc.output('datauristring') }
  }
  doc.save(`${data.numero || 'OS'}.pdf`)
  SB.log('generate_pdf', 'os', data.id || null, data.numero || 'OS', { format: 'pdf' })
  return { totalHT, totalTVA, totalTTC }
}

// ══════════════════════════════════════
// GÉNÉRATEUR PDF — DEVIS (CRM)
// ══════════════════════════════════════
// devis   : ligne crm_devis (ou formulaire en cours)
// opts    : { contact, opportunite, totals, returnBase64 }
export async function generateDevisPdf(devis, opts = {}) {
  const { jsPDF, autoTable } = await loadJsPdf()
  const { contact = null, opportunite = null, totals } = opts
  const doc = new jsPDF('p', 'mm', 'a4')
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  const margin = 18
  const usable = w - margin * 2

  // En-tête : logo à gauche, DEVIS + numéro à droite
  let y = 12
  try { doc.addImage(LOGO_B64, 'JPEG', margin, y - 5, 48, 14) } catch(e) {}
  doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
  doc.text("DEVIS", w - margin, y, { align: "right" })
  doc.setFontSize(12); doc.setTextColor(...BLEU_CLAIR)
  doc.text(sanitize(devis.numero || "AA-NNN"), w - margin, y + 6, { align: "right" })

  y = 24
  doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS)
  doc.text(sanitize(`${ENT.adresse}, ${ENT.cpVille} — SIRET: ${ENT.siret}`), margin, y)
  doc.text(sanitize(`${ENT.email} — ${ENT.assurance}`), margin, y + 3.5)

  y = 31
  doc.setDrawColor(...BLEU); doc.setLineWidth(0.7)
  doc.line(margin, y, w - margin, y); y += 5

  // Dates
  doc.setFillColor(...GRIS_CLAIR)
  doc.roundedRect(margin, y, usable, 9, 1.5, 1.5, 'F')
  doc.setFontSize(7.5); doc.setTextColor(...NOIR)
  const c2 = usable / 2
  doc.setFont("helvetica", "bold"); doc.text("Date : ", margin + 3, y + 6)
  doc.setFont("helvetica", "normal"); doc.text(fmtD(devis.date_emission), margin + 14, y + 6)
  doc.setFont("helvetica", "bold"); doc.text("Valable jusqu'au : ", margin + c2 + 3, y + 6)
  doc.setFont("helvetica", "normal"); doc.text(fmtD(devis.date_validite), margin + c2 + 31, y + 6)
  y += 14

  // Émetteur / Client
  const halfW = (usable - 4) / 2
  const boxH = 26
  doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3)
  doc.rect(margin, y, halfW, boxH)
  doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
  doc.text("ÉMETTEUR", margin + 3, y + 5)
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...NOIR)
  doc.text(sanitize(ENT.nom), margin + 3, y + 10)
  doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS)
  ;[ENT.activite, ENT.adresse, ENT.cpVille, ENT.email].filter(Boolean)
    .forEach((l, i) => doc.text(sanitize(l), margin + 3, y + 14 + i * 3))

  const cx = margin + halfW + 4
  doc.rect(cx, y, halfW, boxH)
  doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
  doc.text("CLIENT", cx + 3, y + 5)
  const cMain = contact ? (contact.societe || contact.nom) : "—"
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...NOIR)
  doc.text(sanitize(cMain || "—"), cx + 3, y + 10)
  doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS)
  const cLines = [
    contact?.societe && contact?.nom && contact.nom !== contact.societe ? `À l'attention de ${contact.nom}` : null,
    ...(doc.splitTextToSize(sanitize(contact?.adresse || ''), halfW - 6).slice(0, 2)),
    contact?.email || null,
    contact?.tel || contact?.tel_fixe || null,
  ].filter(Boolean).slice(0, 4)
  cLines.forEach((l, i) => doc.text(sanitize(l), cx + 3, y + 14 + i * 3))
  y += boxH + 6

  // Objet + adresse des travaux
  if (devis.objet || opportunite?.adresse) {
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
    doc.text("OBJET", margin, y); y += 4
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...NOIR)
    if (devis.objet) {
      const ol = doc.splitTextToSize(sanitize(devis.objet), usable)
      doc.text(ol, margin, y); y += ol.length * 4
    }
    if (opportunite?.adresse) {
      doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS)
      doc.text(sanitize(`Lieu des travaux : ${opportunite.adresse}`), margin, y); y += 4
    }
    y += 3
  }

  // Lignes
  const lignes = devis.lignes || []
  const rows = lignes.map(l => {
    if (l.type === 'titre') {
      return [{ content: sanitize(l.designation || ''), colSpan: 6,
        styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: BLEU } }]
    }
    const q = Number(String(l.quantite).replace(',', '.')) || 0
    const pu = Number(String(l.prix_unitaire).replace(',', '.')) || 0
    return [sanitize(l.designation || ''), sanitize(l.unite || ''), String(q).replace('.', ','),
      fmtM(pu), `${String(Number(l.tva_taux) || 0).replace('.', ',')}%`, fmtM(q * pu)]
  })
  autoTable(doc, {
    startY: y, head: [["Désignation", "Unité", "Qté", "PU HT", "TVA", "Total HT"]], body: rows,
    margin: { left: margin, right: margin, bottom: 20 },
    headStyles: { fillColor: BLEU, textColor: [255,255,255], fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: NOIR },
    columnStyles: {
      0:{cellWidth:usable*0.44},
      1:{cellWidth:usable*0.09,halign:'center'},
      2:{cellWidth:usable*0.07,halign:'center'},
      3:{cellWidth:usable*0.14,halign:'right'},
      4:{cellWidth:usable*0.09,halign:'center'},
      5:{cellWidth:usable*0.17,halign:'right'}
    },
    styles: { lineWidth: 0.2, lineColor: [226,232,240] },
  })
  y = doc.lastAutoTable.finalY + 3

  // Totaux
  const t = totals
  const tvaRows = t.tvaParTaux.filter(x => x.montant > 0 || t.tvaParTaux.length === 1)
  const needed = 8 + (t.remise > 0 ? 8 : 0) + tvaRows.length * 4 + 14 + (t.acompte > 0 ? 5 : 0)
  if (y + needed > h - 20) { doc.addPage(); y = 20 }
  const tx = margin + usable * 0.55
  doc.setDrawColor(...BLEU); doc.setLineWidth(0.3); doc.line(tx, y, w - margin, y); y += 4
  doc.setFontSize(8.5); doc.setTextColor(...NOIR)
  if (t.remise > 0) {
    doc.setFont("helvetica", "normal")
    doc.text("Total HT brut", tx, y); doc.text(fmtM(t.htBrut), w - margin, y, { align: "right" }); y += 4
    doc.text(`Remise ${String(Number(devis.remise_pct) || 0).replace('.', ',')}%`, tx, y)
    doc.text(fmtM(-t.remise), w - margin, y, { align: "right" }); y += 4
  }
  doc.setFont("helvetica", "bold")
  doc.text("Total HT", tx, y); doc.text(fmtM(t.ht), w - margin, y, { align: "right" }); y += 4
  doc.setFont("helvetica", "normal")
  tvaRows.forEach(x => {
    doc.text(`TVA ${String(x.taux).replace('.', ',')}%`, tx, y)
    doc.text(fmtM(x.montant), w - margin, y, { align: "right" }); y += 4
  })
  doc.setDrawColor(...BLEU); doc.setLineWidth(0.5); doc.line(tx, y, w - margin, y); y += 1
  doc.setFillColor(238, 242, 255); doc.rect(tx, y, usable * 0.45, 7, 'F'); y += 5
  doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
  doc.text("TOTAL TTC", tx + 2, y); doc.text(fmtM(t.ttc), w - margin - 2, y, { align: "right" }); y += 6
  if (t.acompte > 0) {
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...NOIR)
    doc.text(`Acompte à la commande (${String(Number(devis.acompte_pct) || 0).replace('.', ',')}%)`, tx, y)
    doc.text(fmtM(t.acompte), w - margin, y, { align: "right" }); y += 5
  }
  y += 4

  // Conditions
  if (devis.conditions) {
    const cl = doc.splitTextToSize(sanitize(devis.conditions), usable)
    if (y + 6 + cl.length * 3.2 > h - 55) { doc.addPage(); y = 20 }
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
    doc.text("CONDITIONS", margin, y); y += 4
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...NOIR)
    doc.text(cl, margin, y); y += cl.length * 3.2 + 6
  }

  // Bon pour accord
  if (y > h - 50) { doc.addPage(); y = 20 }
  const sw = (usable - 4) / 2
  ;[
    { t: "L'émetteur", n: ENT.nom },
    { t: "Bon pour accord — le client", n: "Date, signature et mention « lu et approuvé »" },
  ].forEach((s, i) => {
    const sx = margin + i * (sw + 4); doc.setDrawColor(226,232,240); doc.rect(sx, y, sw, 26)
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...NOIR); doc.text(sanitize(s.t), sx + 2, y + 4)
    doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS); doc.setFontSize(6.5); doc.text(sanitize(s.n), sx + 2, y + 8)
  })

  // Pied + pagination sur toutes les pages
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    pied(doc, w, margin, h - 12)
    if (pages > 1) {
      doc.setFontSize(6); doc.setTextColor(148, 163, 184)
      doc.text(`${p} / ${pages}`, w - margin, h - 6, { align: "right" })
    }
  }

  const filename = `${devis.numero || 'Devis'}.pdf`
  if (opts.returnBase64) return { base64: doc.output('datauristring'), filename }
  doc.save(filename)
  SB.log('generate_pdf', 'crm_devis', devis.id || null, devis.numero || 'Devis', { format: 'pdf' })
  return { filename }
}

// ══════════════════════════════════════
// GÉNÉRATEUR PDF — COMPTE RENDU DE CHANTIER
// ══════════════════════════════════════
//
// Page 1 — page de garde : n° du CR, date et semaine de la réunion,
// opération (chantier, MOA, MOE), convocation à la prochaine réunion,
// intervenants avec présence et convocation, bilan (avancement, points).
// Pages suivantes : synthèse, avancement par lot (réel / prévu / écart),
// puis une section par lot (Généralités d'abord) : observations, tableau
// des points (relances en rouge, soldés en vert, nouveaux en bleu), photos.
// Décisions, prochaine réunion. En-tête et « Page x / n » sur chaque page.
//
// opts.images        : { [path]: dataUrl } photos à imprimer (lib/crPhotos.loadCrImages)
// opts.returnBase64  : renvoie { base64, filename } au lieu de télécharger (mail)
// opts.preview       : ouvre le PDF dans un nouvel onglet (aperçu)
const PRESENCE_COLORS = { 'Présent': [4, 120, 87], 'Absent': [185, 28, 28], 'Excusé': [180, 83, 9] }
const SUIVI_PDF = { relance: 'RELANCE', en_cours: 'En cours', fait: 'FAIT', nouveau: 'NOUVEAU' }

export async function generateCRPdf(cr, chantier, opts = {}) {
  const { jsPDF, autoTable } = await loadJsPdf()
  const doc = new jsPDF('p', 'mm', 'a4')
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  const margin = 18
  const usable = w - margin * 2
  const OR = [200, 164, 92]
  const next = cr.prochaine_reunion?.date ? cr.prochaine_reunion : null
  const suivi = Array.isArray(cr.taches_suivi) ? cr.taches_suivi : []
  const stats = crTaskStats(suivi)
  const images = opts.images || {}
  const progress = globalProgress(cr.sections || [])
  const crIntervenants = cr.intervenants || []
  const withPresence = crIntervenants.some(it => it.presence || it.convoque !== undefined)

  // ── PAGE DE GARDE ──────────────────────────────────────────
  try { doc.addImage(LOGO_B64, 'JPEG', margin, 10, 52, 15) } catch(e) {}
  doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
  doc.text(sanitize(ENT.nom), w - margin, 13, { align: "right" })
  doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS); doc.setFontSize(7)
  doc.text(sanitize(ENT.activite || ""), w - margin, 16.5, { align: "right" })
  doc.text(`${ENT.adresse}, ${ENT.cpVille}`, w - margin, 20, { align: "right" })
  doc.text(ENT.email, w - margin, 23.5, { align: "right" })

  // Bandeau titre
  let y = 32
  doc.setFillColor(...BLEU); doc.rect(0, y, w, 40, 'F')
  doc.setFillColor(...OR); doc.rect(0, y + 40, w, 1.5, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10); doc.setFont("helvetica", "bold")
  doc.text("COMPTE RENDU DE RÉUNION DE CHANTIER", margin, y + 11)
  doc.setFontSize(30)
  doc.text(`N° ${cr.numero || "—"}`, margin, y + 29)
  doc.setFontSize(9); doc.setFont("helvetica", "normal")
  doc.text("Réunion du", w - margin, y + 11, { align: "right" })
  doc.setFontSize(13); doc.setFont("helvetica", "bold")
  doc.text(sanitize(fmtLongDate(cr.date) || fmtD(cr.date)), w - margin, y + 19, { align: "right" })
  const week = isoWeek(cr.date)
  if (week) {
    doc.setFontSize(9); doc.setFont("helvetica", "normal")
    doc.text(`Semaine ${week}`, w - margin, y + 26, { align: "right" })
  }

  // Opération
  y = 84
  doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...OR)
  doc.text("OPÉRATION", margin, y)
  doc.setFontSize(15); doc.setTextColor(...NOIR)
  const nomLines = doc.splitTextToSize(sanitize(chantier?.nom || "—"), usable)
  doc.text(nomLines, margin, y + 7); y += 7 + nomLines.length * 6
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS)
  if (chantier?.adresse) { doc.text(sanitize(chantier.adresse), margin, y); y += 5 }
  y += 1
  const infoLine = (label, value) => {
    doc.setFont("helvetica", "bold"); doc.setTextColor(...GRIS); doc.text(label, margin, y)
    doc.setFont("helvetica", "normal"); doc.setTextColor(...NOIR); doc.text(sanitize(value || "—"), margin + 34, y)
    y += 5
  }
  infoLine("Maître d'ouvrage", chantier?.client)
  infoLine("Maître d'oeuvre", ENT.nom)
  if (chantier?.phase) infoLine("Phase", chantier.phase)
  y += 3

  // Convocation
  if (next) {
    const boxH = 27
    doc.setFillColor(239, 246, 255); doc.setDrawColor(...BLEU); doc.setLineWidth(0.6)
    doc.roundedRect(margin, y, usable, boxH, 2, 2, 'FD')
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
    doc.text("CONVOCATION — PROCHAINE RÉUNION DE CHANTIER", margin + 5, y + 6.5)
    doc.setFontSize(13); doc.setTextColor(...NOIR)
    const heure = next.heure ? ` à ${String(next.heure).slice(0, 5).replace(':', 'h')}` : ''
    doc.text(sanitize(`${fmtLongDate(next.date)}${heure}`), margin + 5, y + 14)
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal")
    if (next.lieu) doc.text(sanitize(`Lieu : ${next.lieu}`), margin + 5, y + 19.5)
    doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(...GRIS)
    doc.text("Les intervenants convoqués sont tenus d'être présents ou représentés.", margin + 5, y + 24)
    doc.setFont("helvetica", "normal")
    y += boxH + 7
  }

  // Intervenants
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
  doc.text("INTERVENANTS", margin, y); y += 3
  if (crIntervenants.length > 0) {
    const head = withPresence
      ? [["Intervenant", "Entreprise / rôle", "Contact", "Présence", "Convoqué"]]
      : [["Intervenant", "Entreprise / rôle", "Contact"]]
    const body = crIntervenants.map(it => {
      const row = [
        sanitize(it.nom || "—"),
        sanitize([it.societe && it.societe !== it.nom ? it.societe : "", it.role].filter(Boolean).join("\n") || "—"),
        sanitize([it.tel, it.email].filter(Boolean).join("\n") || "—"),
      ]
      if (withPresence) row.push(it.presence || "—", it.convoque === false ? "—" : "OUI")
      return row
    })
    autoTable(doc, {
      startY: y, head, body,
      margin: { left: margin, right: margin, top: 26, bottom: 20 },
      headStyles: { fillColor: BLEU, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, textColor: NOIR, valign: 'middle' },
      alternateRowStyles: { fillColor: GRIS_CLAIR },
      columnStyles: withPresence ? {
        0: { cellWidth: usable * 0.22, fontStyle: 'bold' },
        1: { cellWidth: usable * 0.25 },
        2: { cellWidth: usable * 0.29 },
        3: { cellWidth: usable * 0.12, halign: 'center' },
        4: { cellWidth: usable * 0.12, halign: 'center' },
      } : { 0: { cellWidth: usable * 0.3, fontStyle: 'bold' }, 1: { cellWidth: usable * 0.32 } },
      styles: { lineWidth: 0.2, lineColor: [226, 232, 240], cellPadding: 1.8 },
      didParseCell: (d) => {
        if (d.section !== 'body' || !withPresence) return
        if (d.column.index === 3 && PRESENCE_COLORS[d.cell.raw]) {
          d.cell.styles.textColor = PRESENCE_COLORS[d.cell.raw]; d.cell.styles.fontStyle = 'bold'
        }
        if (d.column.index === 4 && d.cell.raw === 'OUI') { d.cell.styles.textColor = BLEU; d.cell.styles.fontStyle = 'bold' }
      },
    })
    y = doc.lastAutoTable.finalY + 4
    if (cr.participants) {
      doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(...GRIS)
      const noteLines = doc.splitTextToSize(sanitize(`Également présents : ${cr.participants}`), usable)
      doc.text(noteLines, margin, y); y += noteLines.length * 3.5 + 3
      doc.setFont("helvetica", "normal")
    }
  } else {
    y += 2
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...NOIR)
    const pLines = doc.splitTextToSize(sanitize(cr.participants) || "—", usable)
    doc.text(pLines, margin, y); y += pLines.length * 3.8 + 3
  }

  // Bilan des points
  if (stats.total > 0 || progress != null) {
    if (y > h - 45) { doc.addPage(); y = 26 }
    y += 2
    const items = [
      ...(progress != null ? [["Avancement", `${progress} %`, BLEU]] : []),
      ["Points suivis", stats.total, NOIR],
      ["Nouveaux", stats.nouveau, BLEU_CLAIR],
      ["Soldés", stats.fait, [4, 120, 87]],
      ["Relancés", stats.relance, [185, 28, 28]],
      ["Urgents", stats.urgent, [185, 28, 28]],
    ]
    const cw = usable / items.length
    items.forEach(([label, n, color], i) => {
      const x = margin + i * cw
      doc.setFillColor(...GRIS_CLAIR); doc.roundedRect(x + 1, y, cw - 2, 15, 1.5, 1.5, 'F')
      doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(...color)
      doc.text(String(n), x + cw / 2, y + 7.5, { align: "center" })
      doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS)
      doc.text(label.toUpperCase(), x + cw / 2, y + 12, { align: "center" })
    })
    y += 19
  }

  // Diffusion (bas de la page de garde)
  const diffY = Math.max(y + 4, h - 34)
  if (diffY < h - 22) {
    doc.setDrawColor(...OR); doc.setLineWidth(0.4); doc.line(margin, diffY, margin + 30, diffY)
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
    doc.text("DIFFUSION", margin, diffY + 5)
    doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS)
    doc.text("Intervenants listés ci-dessus et maître d'ouvrage.", margin, diffY + 9)
    doc.text("Sans observation écrite sous 8 jours, le présent compte rendu est réputé approuvé.", margin, diffY + 12.5)
  }

  // ── CORPS ──────────────────────────────────────────────────
  doc.addPage(); y = 28
  let section = 0
  const title = (t) => {
    if (y > h - 45) { doc.addPage(); y = 28 }
    section += 1
    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
    doc.text(`${section}. ${t}`, margin, y)
    doc.setDrawColor(...OR); doc.setLineWidth(0.5); doc.line(margin, y + 1.5, margin + 18, y + 1.5)
    y += 6
  }
  const textBlock = (text, { fill = null, bar = null, color = NOIR } = {}) => {
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal")
    const lines = doc.splitTextToSize(sanitize(text) || "—", usable - 6)
    let i = 0
    while (i < lines.length) {
      const room = Math.max(1, Math.floor((h - 24 - y - 6) / 4))
      const chunk = lines.slice(i, i + room)
      const bh = chunk.length * 4 + 5
      if (fill) { doc.setFillColor(...fill); doc.roundedRect(margin, y, usable, bh, 1.5, 1.5, 'F') }
      else { doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3); doc.rect(margin, y, usable, bh) }
      if (bar) { doc.setDrawColor(...bar); doc.setLineWidth(0.8); doc.line(margin, y, margin, y + bh) }
      doc.setTextColor(...color); doc.text(chunk, margin + 3, y + 5)
      y += bh + 6; i += chunk.length
      if (i < lines.length) { doc.addPage(); y = 28 }
    }
  }

  // Sections : celles du CR (par lot) ou, pour un ancien CR, regroupement
  // des points par lot.
  const crSections = [...(Array.isArray(cr.sections) ? cr.sections : [])]
  for (const lot of [GENERAL, ...suivi.map(r => lotOf(r))]) {
    if (!crSections.some(x => lotKey(x.lot) === lotKey(lot))) {
      const sec = { lot, observations: '', photos: [] }
      if (lotKey(lot) === lotKey(GENERAL)) crSections.unshift(sec); else crSections.push(sec)
    }
  }
  const pointsOf = (lot) => suivi.filter(r => lotKey(lotOf(r)) === lotKey(lot))
  const imageOf = (p) => p?.dataUrl || (p?.path && images[p.path]) || null

  const photoGrid = (photos) => {
    const list = photos.filter(p => imageOf(p.photo || p))
    if (!list.length) return
    const gap = 5
    const perRow = 3
    const cw = (usable - gap * (perRow - 1)) / perRow
    const ch = cw * 0.75
    for (let i = 0; i < list.length; i += perRow) {
      if (y + ch + 10 > h - 22) { doc.addPage(); y = 28 }
      for (let j = 0; j < perRow && i + j < list.length; j++) {
        const item = list[i + j]
        const photo = item.photo || item
        const src = imageOf(photo)
        const x = margin + j * (cw + gap)
        doc.setFillColor(...GRIS_CLAIR); doc.rect(x, y, cw, ch, 'F')
        try {
          const props = doc.getImageProperties(src)
          const ratio = Math.min(cw / props.width, ch / props.height)
          const iw = props.width * ratio, ih = props.height * ratio
          doc.addImage(src, props.fileType || 'JPEG', x + (cw - iw) / 2, y + (ch - ih) / 2, iw, ih)
        } catch (e) { /* image illisible */ }
        const caption = [item.num ? `Point n°${item.num}` : '', photo.legende].filter(Boolean).join(' — ')
        if (caption) {
          doc.setFontSize(7); doc.setFont("helvetica", "italic"); doc.setTextColor(...GRIS)
          doc.text(doc.splitTextToSize(sanitize(caption), cw)[0], x, y + ch + 3.5)
          doc.setFont("helvetica", "normal")
        }
      }
      y += ch + 7
    }
  }

  const pointsTable = (rows) => {
    const body = rows.map(r => {
      const late = r.suivi === 'relance' ? daysLate(r.echeance, cr.date) : 0
      const origine = r.origine && Number(r.origine) !== Number(cr.numero) ? `\n(depuis le CR n°${r.origine})` : ''
      const etat = r.suivi === 'relance' && r.rappels > 1 ? `RELANCE n°${r.rappels}` : (SUIVI_PDF[r.suivi] || r.suivi || '—')
      return [
        r.num ? String(r.num) : '—',
        sanitize(`${r.titre || '—'}${origine}`),
        sanitize(r.entreprise || '—'),
        `${r.echeance ? fmtD(r.echeance) : '—'}${late ? `\nretard ${late} j` : ''}`,
        priorityLabel(r.priorite),
        etat,
      ]
    })
    autoTable(doc, {
      startY: y,
      head: [["N°", "Point", "Entreprise", "Échéance", "Priorité", "État"]],
      body,
      margin: { left: margin, right: margin, top: 28, bottom: 20 },
      headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, textColor: NOIR, valign: 'middle' },
      columnStyles: {
        0: { cellWidth: usable * 0.07, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: usable * 0.38 },
        2: { cellWidth: usable * 0.19 },
        3: { cellWidth: usable * 0.13, halign: 'center' },
        4: { cellWidth: usable * 0.1, halign: 'center' },
        5: { cellWidth: usable * 0.13, halign: 'center', fontStyle: 'bold' },
      },
      styles: { lineWidth: 0.2, lineColor: [226, 232, 240], cellPadding: 1.8 },
      didParseCell: (d) => {
        if (d.section !== 'body') return
        const r = rows[d.row.index]
        if (r?.suivi === 'relance') d.cell.styles.fillColor = [254, 242, 242]
        else if (r?.suivi === 'fait') d.cell.styles.fillColor = [236, 253, 245]
        if (d.column.index === 5) {
          d.cell.styles.textColor = r?.suivi === 'relance' ? [185, 28, 28]
            : r?.suivi === 'fait' ? [4, 120, 87] : r?.suivi === 'nouveau' ? BLEU_CLAIR : NOIR
        }
        if (d.column.index === 4 && d.cell.raw === 'Urgente') { d.cell.styles.textColor = [185, 28, 28]; d.cell.styles.fontStyle = 'bold' }
        if (d.column.index === 3 && String(d.cell.raw).includes('retard')) d.cell.styles.textColor = [185, 28, 28]
      },
    })
    y = doc.lastAutoTable.finalY + 5
  }

  if (cr.resume) {
    title("SYNTHÈSE DE LA RÉUNION")
    textBlock(cr.resume)
  }

  // Avancement par lot
  const avRows = crSections.filter(s => lotKey(s.lot) !== lotKey(GENERAL) && (s.avancement != null || s.prevu != null))
  if (avRows.length) {
    title("AVANCEMENT PAR LOT")
    autoTable(doc, {
      startY: y,
      head: [["Lot", "Entreprise", "CR précédent", "Avancement", "Prévu", "Écart"]],
      body: avRows.map(s => {
        const ecart = s.avancement != null && s.prevu != null ? s.avancement - s.prevu : null
        return [
          sanitize(s.lot), sanitize(s.entreprise || '—'),
          s.avancement_prec != null ? `${s.avancement_prec} %` : '—',
          s.avancement != null ? `${s.avancement} %` : '—',
          s.prevu != null ? `${s.prevu} %` : '—',
          ecart == null ? '—' : `${ecart > 0 ? '+' : ''}${ecart} pts`,
        ]
      }),
      margin: { left: margin, right: margin, top: 28, bottom: 20 },
      headStyles: { fillColor: BLEU, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, textColor: NOIR },
      columnStyles: { 0: { fontStyle: 'bold' }, 2: { halign: 'center' }, 3: { halign: 'center', fontStyle: 'bold' }, 4: { halign: 'center' }, 5: { halign: 'center' } },
      alternateRowStyles: { fillColor: GRIS_CLAIR },
      styles: { lineWidth: 0.2, lineColor: [226, 232, 240], cellPadding: 1.8 },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 5 && d.cell.raw !== '—') {
          d.cell.styles.textColor = String(d.cell.raw).startsWith('-') ? [185, 28, 28] : [4, 120, 87]
        }
      },
    })
    y = doc.lastAutoTable.finalY + 7
  }

  // Une section par lot (Généralités d'abord)
  for (const s of crSections) {
    const rows = pointsOf(s.lot)
    const photos = [
      ...(s.photos || []),
      ...rows.flatMap(r => (r.photos || []).map(photo => ({ photo, num: r.num }))),
    ]
    if (!rows.length && !s.observations && !photos.some(p => imageOf(p.photo || p))) continue
    if (y > h - 50) { doc.addPage(); y = 28 }
    section += 1
    doc.setFillColor(...BLEU); doc.rect(margin, y - 4.5, usable, 7.5, 'F')
    doc.setFontSize(9.5); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255)
    doc.text(sanitize(`${section}. ${String(s.lot).toUpperCase()}`), margin + 3, y)
    const right = [s.entreprise, s.avancement != null ? `avancement ${s.avancement} %` : ''].filter(Boolean).join('  |  ')
    if (right) {
      doc.setFontSize(8); doc.setFont("helvetica", "normal")
      doc.text(sanitize(right), w - margin - 3, y, { align: "right" })
    }
    y += 7
    if (s.observations) textBlock(s.observations)
    if (rows.length) pointsTable(rows)
    photoGrid(photos)
    y += 2
  }
  if (suivi.length > 0) {
    doc.setFontSize(7); doc.setFont("helvetica", "italic"); doc.setTextColor(...GRIS)
    if (y > h - 30) { doc.addPage(); y = 28 }
    const legend = doc.splitTextToSize("Les points gardent leur numéro d'un compte rendu à l'autre. Tout point non réalisé à son échéance est relancé au compte rendu suivant et sa priorité est relevée d'un niveau.", usable)
    doc.text(legend, margin, y); y += legend.length * 3.2 + 6
    doc.setFont("helvetica", "normal")
  }

  if (cr.decisions) {
    title("DÉCISIONS")
    textBlock(cr.decisions, { fill: [254, 243, 199], bar: [245, 158, 11], color: [146, 64, 14] })
  }

  if (y > h - 40) { doc.addPage(); y = 28 }
  doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS)
  doc.text(sanitize(`Établi par ${ENT.nom}, maître d'oeuvre, le ${fmtD(cr.date)}.`), margin, y + 2)
  if (next) {
    const heure = next.heure ? ` à ${String(next.heure).slice(0, 5).replace(':', 'h')}` : ''
    doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
    doc.text(sanitize(`Prochaine réunion : ${fmtLongDate(next.date)}${heure}${next.lieu ? `, ${next.lieu}` : ''}`), margin, y + 7)
  }

  // En-têtes (pages 2+) et pieds de page sur toutes les pages
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    if (p > 1) {
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
      doc.text(sanitize(`CR n°${cr.numero || "-"}  |  ${chantier?.nom || ""}`), margin, 14)
      doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS)
      doc.text(`Réunion du ${fmtD(cr.date)}`, w - margin, 14, { align: "right" })
      doc.setDrawColor(...BLEU); doc.setLineWidth(0.5); doc.line(margin, 17, w - margin, 17)
    }
    pied(doc, w, margin, h - 12)
    doc.setFontSize(6.5); doc.setTextColor(148, 163, 184)
    doc.text(`Page ${p} / ${total}`, w - margin, h - 5, { align: "right" })
  }

  const filename = `CR-${cr.numero || "X"}-${(chantier?.nom || "chantier").replace(/[^\w-]+/g, "_")}.pdf`
  SB.log('generate_pdf', 'cr', cr.id || null,
    `CR n°${cr.numero || 'X'}`, { format: 'pdf', chantier_id: chantier?.id || null })
  if (opts.returnBase64) return { base64: doc.output('datauristring'), filename }
  if (opts.preview && typeof window !== 'undefined') {
    const url = doc.output('bloburl')
    if (window.open(url, '_blank')) return { filename }
  }
  doc.save(filename)
  return { filename }
}

// ══════════════════════════════════════
// GÉNÉRATEUR EXCEL — ORDRE DE SERVICE
// ══════════════════════════════════════
export function generateOSExcel(data) {
  // Build CSV content (universally compatible, opens in Excel)
  const prestations = data.prestations || []
  const tvaNA = !!data.tva_non_applicable
  let totalHT = 0
  const rows = prestations.map(p => {
    const q = parseFloat(p.quantite)||0, pu = parseFloat(p.prix_unitaire)||0
    const tva = tvaNA ? 0 : (parseFloat(p.tva_taux)||20)
    const lht = q * pu; totalHT += lht
    return [p.description||"", p.unite||"", q, pu, `${tva}%`, lht, lht * tva / 100]
  })
  const totalTVA = rows.reduce((s, r) => s + r[6], 0)

  let csv = "\uFEFF" // BOM for Excel UTF-8
  csv += `ORDRE DE SERVICE;${data.numero||""}\n`
  csv += `Chantier;${data.chantier||""}\n`
  csv += `Adresse;${data.adresse_chantier||""}\n`
  csv += `Client;${data.client_nom||""}\n`
  csv += `Artisan;${data.artisan_nom||""}\n`
  csv += `Spécialité;${data.artisan_specialite||""}\n`
  csv += `Date émission;${fmtD(data.date_emission)}\n`
  csv += `Date intervention;${fmtD(data.date_intervention)}\n`
  csv += `Date fin prévue;${fmtD(data.date_fin_prevue)}\n`
  csv += `\n`
  csv += `Description;Unité;Quantité;Prix Unitaire HT;TVA;Total HT;Montant TVA\n`
  rows.forEach(r => {
    csv += `${r[0]};${r[1]};${r[2]};${r[3].toFixed(2)};${r[4]};${r[5].toFixed(2)};${r[6].toFixed(2)}\n`
  })
  csv += `\n`
  csv += `;;;;;Total HT;${totalHT.toFixed(2)}\n`
  csv += `;;;;;Total TVA;${totalTVA.toFixed(2)}\n`
  csv += `;;;;;TOTAL TTC;${(totalHT + totalTVA).toFixed(2)}\n`
  csv += `\n`
  if (tvaNA) csv += `Mention légale;TVA non applicable, art. 293 B du CGI.\n`
  if (data.observations) csv += `Observations;${data.observations}\n`
  if (data.conditions) csv += `Conditions;${data.conditions}\n`

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${data.numero || 'OS'}.csv`
  link.click()
  SB.log('generate_excel', 'os', data.id || null, data.numero || 'OS', { format: 'xlsx' })
}

// ══════════════════════════════════════
// GÉNÉRATEUR EXCEL — COMPTE RENDU
// ══════════════════════════════════════
export function generateCRExcel(cr, chantier) {
  let csv = "\uFEFF"
  csv += `COMPTE RENDU DE CHANTIER;N°${cr.numero||""}\n`
  csv += `\n`
  csv += `Chantier;${chantier?.nom||""}\n`
  csv += `Client;${chantier?.client||""}\n`
  csv += `Adresse;${chantier?.adresse||""}\n`
  csv += `Phase;${chantier?.phase||""}\n`
  csv += `Date;${fmtD(cr.date)}\n`
  csv += `\n`
  const crIntervenants = cr.intervenants || []
  if (crIntervenants.length > 0) {
    csv += `INTERVENANTS\n`
    csv += `N°;Nom;Entreprise;Email;Téléphone;Présence;Convoqué\n`
    crIntervenants.forEach((it, idx) => {
      csv += `${idx + 1};${it.nom||""};${it.societe||""};${it.email||""};${it.tel||""};${it.presence||""};${it.convoque === false ? "" : (it.presence ? "oui" : "")}\n`
    })
    if (cr.participants) csv += `Également présents;${cr.participants}\n`
  } else {
    csv += `PARTICIPANTS\n`
    csv += `${cr.participants||""}\n`
  }
  csv += `\n`
  csv += `RÉSUMÉ DES ÉCHANGES\n`
  csv += `"${(cr.resume||"").replace(/"/g, '""')}"\n`
  csv += `\n`
  csv += `DÉCISIONS & ACTIONS\n`
  csv += `"${(cr.decisions||"").replace(/"/g, '""')}"\n`
  csv += `\n`
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const suivi = Array.isArray(cr.taches_suivi) ? cr.taches_suivi : []
  if (suivi.length > 0) {
    csv += `SUIVI DES POINTS\n`
    csv += `N°;Lot;Point;Entreprise;Échéance;Priorité;État;Rappels;CR d'origine\n`
    suivi.forEach((r) => {
      csv += [r.num || "", q(lotOf(r)), q(r.titre), q(r.entreprise), fmtD(r.echeance), priorityLabel(r.priorite),
        SUIVI_PDF[r.suivi] || r.suivi || "", r.rappels || 0, r.origine || ""].join(";") + "\n"
    })
    csv += `\n`
  }
  const lotsCr = (cr.sections || []).filter(x => x.avancement != null || x.observations)
  if (lotsCr.length > 0) {
    csv += `LOTS\n`
    csv += `Lot;Entreprise;Avancement;Prévu;Observations\n`
    lotsCr.forEach(x => {
      csv += [q(x.lot), q(x.entreprise), x.avancement ?? "", x.prevu ?? "", q(x.observations)].join(";") + "\n"
    })
    csv += `\n`
  }
  const next = cr.prochaine_reunion
  if (next?.date) {
    csv += `PROCHAINE RÉUNION;${fmtD(next.date)};${next.heure || ""};${q(next.lieu)}\n`
    csv += `\n`
  }
  csv += `${ENT.nom};${ENT.adresse};${ENT.cpVille};SIRET ${ENT.siret}\n`

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `CR-${cr.numero||"X"}-${(chantier?.nom||"chantier").replace(/\s+/g, "_")}.csv`
  link.click()
  SB.log('generate_excel', 'cr', cr.id || null,
    `CR n°${cr.numero || 'X'}`, { format: 'xlsx', chantier_id: chantier?.id || null })
}

// ══════════════════════════════════════
// GÉNÉRATEUR PDF — REPORTAGE PHOTO DE CHANTIER
// ══════════════════════════════════════
//
// Prend un objet chantier + un tableau de photos (avec base64 pré-chargée)
// et produit un rapport photo professionnel au format A4 :
// - Page de garde : logo, nom chantier, adresse, client, date, nb photos
// - Pages intérieures : 2 photos/page avec légende + date
// - Pied de page : infos entreprise + pagination
//
// Les photos doivent être pré-chargées en base64 avant l'appel (le
// composant PhotoReportsV s'en charge via fetch → canvas → base64).
//
export async function generatePhotoReportPdf(chantier, photos, opts = {}) {
  const { meteo } = opts
  const { jsPDF } = await loadJsPdf()
  const doc = new jsPDF('p', 'mm', 'a4')
  const w = doc.internal.pageSize.getWidth()   // 210mm
  const h = doc.internal.pageSize.getHeight()   // 297mm
  const margin = 15
  const usable = w - margin * 2                 // 180mm
  const today = fmtD(new Date())

  // ─── PAGE DE GARDE ──────────────────
  // Logo en haut
  let y = 30
  try { doc.addImage(LOGO_B64, 'JPEG', margin, y, 60, 17) } catch {}

  // Titre
  y = 80
  doc.setFontSize(28)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...BLEU)
  doc.text(sanitize("REPORTAGE PHOTO"), w / 2, y, { align: "center" })

  // Chantier info
  y = 105
  doc.setFontSize(18)
  doc.setTextColor(...NOIR)
  doc.text(sanitize(chantier.nom || "Chantier"), w / 2, y, { align: "center" })

  y = 118
  doc.setFontSize(12)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...GRIS)
  if (chantier.adresse) doc.text(sanitize(chantier.adresse), w / 2, y, { align: "center" })
  y += 8
  if (chantier.client) doc.text(sanitize("Client : " + chantier.client), w / 2, y, { align: "center" })
  y += 8
  if (chantier.phase) doc.text(sanitize("Phase : " + chantier.phase), w / 2, y, { align: "center" })

  // Date + météo + compteur
  y = 170
  doc.setFontSize(11)
  doc.setTextColor(...GRIS)
  doc.text(sanitize(`Date du rapport : ${today}`), w / 2, y, { align: "center" })
  y += 7
  if (meteo) {
    doc.text(sanitize(`Météo : ${meteo}`), w / 2, y, { align: "center" })
    y += 7
  }
  doc.text(sanitize(`${photos.length} photo${photos.length > 1 ? "s" : ""}`), w / 2, y, { align: "center" })

  // Entreprise en bas de la page de garde
  y = 260
  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  doc.text(sanitize(ENT.nom), w / 2, y, { align: "center" })
  doc.setFontSize(7.5)
  y += 5
  doc.text(sanitize(`${ENT.adresse}, ${ENT.cpVille}`), w / 2, y, { align: "center" })
  y += 4
  doc.text(sanitize(`SIRET ${ENT.siret} — ${ENT.email}`), w / 2, y, { align: "center" })

  // ─── PAGES PHOTOS ─────────────────────
  //
  // Layout intelligent :
  // - Photo portrait (height > width) + suivante aussi portrait
  //   → côte à côte sur la même ligne (2 colonnes)
  // - Photo paysage (width >= height) → pleine largeur
  // - Photo portrait isolée (la suivante est paysage ou c'est la dernière)
  //   → pleine largeur aussi
  //
  // Résultat : utilisation optimale de l'espace, moins de pages, PDF plus compact.
  const gap = 8             // espace entre 2 colonnes (mm)
  const colW = (usable - gap) / 2  // largeur d'une colonne (~86mm)
  const maxRowH = 120       // hauteur max d'une rangée (mm)
  let pageNum = 1

  const isPortrait = (p) => p.height > p.width

  // Helper : ajouter une nouvelle page avec en-tête léger
  const addPhotoPage = () => {
    doc.addPage()
    pageNum++
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...GRIS)
    const headerLeft = meteo
      ? sanitize(`${chantier.nom} — Reportage photo — ${today} — ${meteo}`)
      : sanitize(`${chantier.nom} — Reportage photo — ${today}`)
    doc.text(headerLeft, margin, 10)
    doc.text(sanitize(`Page ${pageNum}`), w - margin, 10, { align: "right" })
    return 18  // y de départ après l'en-tête
  }

  // Helper : dessiner une photo dans une zone (x, y, maxW, maxH)
  const drawPhoto = (photo, x, photoY, maxW, maxH) => {
    if (!photo.base64) return maxH
    try {
      const props = doc.getImageProperties(photo.base64)
      const ratio = props.width / props.height
      let imgW = maxW
      let imgH = imgW / ratio
      if (imgH > maxH) { imgH = maxH; imgW = imgH * ratio }
      const imgX = x + (maxW - imgW) / 2  // centrer dans la colonne
      doc.addImage(photo.base64, 'JPEG', imgX, photoY, imgW, imgH)
      doc.setDrawColor(203, 213, 225)
      doc.setLineWidth(0.3)
      doc.rect(imgX, photoY, imgW, imgH)
      return imgH
    } catch {
      return 0
    }
  }

  // Helper : dessiner la légende sous une photo
  const drawCaption = (photo, x, captionY, maxW) => {
    let cy = captionY
    if (photo.description) {
      doc.setFontSize(9)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(...NOIR)
      const lines = doc.splitTextToSize(sanitize(photo.description), maxW)
      doc.text(lines, x, cy + 3)
      cy += lines.length * 4
    }
    doc.setFontSize(7)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...GRIS)
    doc.text(sanitize(fmtD(photo.date_photo)), x, cy + 3)
    return cy + 6
  }

  y = addPhotoPage()
  let i = 0
  while (i < photos.length) {
    const photo = photos[i]
    const next = i + 1 < photos.length ? photos[i + 1] : null

    // Vérifier s'il reste assez de place sur la page
    if (y > h - 50) y = addPhotoPage()

    // ── Cas 1 : deux portraits côte à côte ──
    if (isPortrait(photo) && next && isPortrait(next)) {
      const rowH = Math.min(maxRowH, h - y - 30)
      const h1 = drawPhoto(photo, margin, y, colW, rowH)
      const h2 = drawPhoto(next, margin + colW + gap, y, colW, rowH)
      const photoH = Math.max(h1, h2)

      // Légendes sous chaque photo
      const captionY = y + photoH + 2
      const endY1 = drawCaption(photo, margin, captionY, colW)
      const endY2 = drawCaption(next, margin + colW + gap, captionY, colW)
      y = Math.max(endY1, endY2) + 8

      i += 2
    }
    // ── Cas 2 : photo paysage ou portrait isolée → pleine largeur ──
    else {
      const rowH = Math.min(maxRowH, h - y - 30)
      const photoH = drawPhoto(photo, margin, y, usable, rowH)
      const captionY = y + photoH + 2
      y = drawCaption(photo, margin, captionY, usable) + 8

      i += 1
    }
  }

  // ─── Pied de page sur la dernière page ───────────────────────
  pied(doc, w, margin, h - 15)

  // ─── Retour du blob SANS téléchargement auto ──
  // Le téléchargement est déclenché par l'appelant APRÈS l'upload serveur.
  // Raison : iOS Safari coupe les fetch en cours quand doc.save() trigger
  // un download (interprété comme une "navigation").
  const slug = (chantier.nom || "chantier").replace(/\s+/g, "_").replace(/[^\w-]/g, "")
  const filename = `Reportage-Photo_${slug}_${new Date().toISOString().split("T")[0]}.pdf`
  SB.log('generate_pdf', 'photo_report', chantier?.id || null,
    `Reportage — ${chantier?.nom || 'Chantier'}`,
    { format: 'pdf', photo_count: (photos || []).length })
  return { blob: doc.output('blob'), filename }
}
