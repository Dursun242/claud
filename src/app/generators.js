'use client'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

// ═══════════════════════════════════════════
// CONSTANTES ID MAÎTRISE
// ═══════════════════════════════════════════
const BLEU = [30, 58, 95]
const BLEU_CLAIR = [59,130,246]
const GRIS = [100,116,139]
const GRIS_CLAIR = [241,245,249]
const NOIR = [15,23,42]

const ENT = {
  nom: "SARL ID MAÎTRISE",
  activite: "Maîtrise d'œuvre - Ingénierie BTP",
  adresse: "9 Rue Henry Genestal",
  cpVille: "76600 LE HAVRE",
  email: "contact@id-maitrise.com",
  siret: "921 536 181 00024",
  assurance: "Décennale MIC Insurance - N° LUN2205206",
}

const fmtD = (d) => {
  if (!d) return "—"
  try { return new Date(d).toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric" }) }
  catch { return d }
}

const fmtM = (n) => new Intl.NumberFormat("fr-FR", { style:"currency", currency:"EUR" }).format(n)

function entete(doc, w, margin) {
  let y = 15
  doc.setFontSize(14)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...BLEU)
  doc.text(ENT.nom, margin, y)
  y += 4.5
  doc.setFontSize(7.5)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...GRIS)
  doc.text(`${ENT.activite} — ${ENT.adresse}, ${ENT.cpVille}`, margin, y)
  y += 3
  doc.text(`SIRET: ${ENT.siret} — ${ENT.email}`, margin, y)
  return y + 2
}

function pied(doc, w, margin, y) {
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.2)
  doc.line(margin, y, w - margin, y)
  y += 3
  doc.setFontSize(6)
  doc.setTextColor(148, 163, 184)
  doc.text(`${ENT.nom} — ${ENT.adresse}, ${ENT.cpVille} — SIRET ${ENT.siret} — ${ENT.assurance}`, w / 2, y, { align: "center" })
}

// ═══════════════════════════════════════════
// GÉNÉRATEUR PDF — ORDRE DE SERVICE
// ═══════════════════════════════════════════
export function generateOSPdf(data) {
  const doc = new jsPDF('p', 'mm', 'a4')
  const w = doc.internal.pageSize.getWidth()
  const margin = 18
  const usable = w - margin * 2
  let y = entete(doc, w, margin)

  // Titre
  doc.setFontSize(18)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...BLEU)
  doc.text("ORDRE DE SERVICE", w - margin, 18, { align: "right" })
  doc.setFontSize(13)
  doc.setTextColor(...BLEU_CLAIR)
  doc.text(data.numero || "OS-XXXX", w - margin, 25, { align: "right" })

  y = 34
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
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...NOIR)
  doc.text(data.artisan_nom || "—", ax + 3, y + 10)
  doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS)
  const aLines = [data.artisan_specialite, `Tél: ${data.artisan_tel||""}`, `SIRET: ${data.artisan_siret||""}`].filter(Boolean)
  aLines.forEach((l, i) => doc.text(l, ax + 3, y + 15 + i * 3.2))
  y += 32

  // Prestations
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
  doc.text("DÉTAIL DES PRESTATIONS", margin, y); y += 3

  const prestations = data.prestations || []
  let totalHT = 0; const tvaMap = {}
  const tbody = prestations.map(p => {
    const q = parseFloat(p.quantite)||0, pu = parseFloat(p.prix_unitaire)||0, tva = parseFloat(p.tva_taux)||20
    const lht = q * pu; totalHT += lht
    tvaMap[tva] = (tvaMap[tva]||0) + lht * tva / 100
    return [p.description||"", p.unite||"", q.toString(), fmtM(pu), `${tva}%`, fmtM(lht)]
  })
  const totalTVA = Object.values(tvaMap).reduce((s, v) => s + v, 0)
  const totalTTC = totalHT + totalTVA

  doc.autoTable({
    startY: y, head: [["Description", "Unité", "Qté", "PU HT", "TVA", "Total HT"]], body: tbody,
    margin: { left: margin, right: margin },
    headStyles: { fillColor: BLEU, textColor: [255,255,255], fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: NOIR },
    alternateRowStyles: { fillColor: GRIS_CLAIR },
    columnStyles: { 0:{cellWidth:usable*0.34}, 1:{cellWidth:usable*0.09,halign:'center'}, 2:{cellWidth:usable*0.07,halign:'center'}, 3:{cellWidth:usable*0.14,halign:'right'}, 4:{cellWidth:usable*0.09,halign:'center'}, 5:{cellWidth:usable*0.17,halign:'right'} },
    styles: { lineWidth: 0.2, lineColor: [226,232,240] },
  })
  y = doc.lastAutoTable.finalY + 3

  // Totaux
  const tx = margin + usable * 0.55
  doc.setDrawColor(...BLEU); doc.setLineWidth(0.3); doc.line(tx, y, w - margin, y); y += 4
  doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...NOIR)
  doc.text("Total HT", tx, y); doc.text(fmtM(totalHT), w - margin, y, { align: "right" }); y += 4
  doc.setFont("helvetica", "normal")
  Object.entries(tvaMap).sort().forEach(([t, m]) => { doc.text(`TVA ${t}%`, tx, y); doc.text(fmtM(m), w - margin, y, { align: "right" }); y += 4 })
  doc.setDrawColor(...BLEU); doc.setLineWidth(0.5); doc.line(tx, y, w - margin, y); y += 1
  doc.setFillColor(238, 242, 255); doc.rect(tx, y, usable * 0.45, 7, 'F'); y += 5
  doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
  doc.text("TOTAL TTC", tx + 2, y); doc.text(fmtM(totalTTC), w - margin - 2, y, { align: "right" }); y += 8

  // Observations
  if (data.observations) {
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
    doc.text("OBSERVATIONS", margin, y); y += 4
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...NOIR)
    const ol = doc.splitTextToSize(data.observations, usable); doc.text(ol, margin, y); y += ol.length * 3.2 + 4
  }

  // Conditions
  if (data.conditions) {
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
    doc.text("CONDITIONS", margin, y); y += 4
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...NOIR)
    const cl = doc.splitTextToSize(data.conditions, usable); doc.text(cl, margin, y); y += cl.length * 3.2 + 6
  }

  // Signatures
  if (y > 245) { doc.addPage(); y = 20 }
  doc.setDrawColor(226,232,240); doc.setLineWidth(0.3); doc.line(margin, y, w - margin, y); y += 5
  const sw = (usable - 6) / 3
  ;[{ t:"Le Maître d'œuvre", n:ENT.nom }, { t:"L'Entreprise", n:data.artisan_nom||"" }, { t:"Le Maître d'ouvrage", n:data.client_nom||"" }].forEach((s, i) => {
    const sx = margin + i * (sw + 3); doc.rect(sx, y, sw, 24)
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...NOIR); doc.text(s.t, sx + 2, y + 4)
    doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS); doc.text(s.n, sx + 2, y + 8)
    doc.setFontSize(6.5); doc.text("Date et signature :", sx + 2, y + 21)
  })
  y += 30
  pied(doc, w, margin, y)
  doc.save(`${data.numero || 'OS'}.pdf`)
  return { totalHT, totalTVA, totalTTC }
}

// ═══════════════════════════════════════════
// GÉNÉRATEUR PDF — COMPTE RENDU DE CHANTIER
// ═══════════════════════════════════════════
export function generateCRPdf(cr, chantier) {
  const doc = new jsPDF('p', 'mm', 'a4')
  const w = doc.internal.pageSize.getWidth()
  const margin = 18
  const usable = w - margin * 2
  let y = entete(doc, w, margin)

  // Titre
  doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
  doc.text("COMPTE RENDU DE CHANTIER", w - margin, 18, { align: "right" })
  doc.setFontSize(12); doc.setTextColor(...BLEU_CLAIR)
  doc.text(`N°${cr.numero || "—"}`, w - margin, 25, { align: "right" })

  y = 34
  doc.setDrawColor(...BLEU); doc.setLineWidth(0.7); doc.line(margin, y, w - margin, y); y += 5

  // Infos chantier
  doc.setFillColor(...GRIS_CLAIR); doc.roundedRect(margin, y, usable, 16, 1.5, 1.5, 'F')
  doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
  doc.text("CHANTIER", margin + 3, y + 5)
  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...NOIR)
  doc.text(chantier?.nom || "—", margin + 28, y + 5)
  doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...GRIS)
  doc.text("Client :", margin + 3, y + 11); doc.setFont("helvetica", "normal"); doc.setTextColor(...NOIR); doc.text(chantier?.client || "—", margin + 18, y + 11)
  doc.setFont("helvetica", "bold"); doc.setTextColor(...GRIS)
  doc.text("Date :", margin + usable/2, y + 5); doc.setFont("helvetica", "normal"); doc.setTextColor(...NOIR); doc.text(fmtD(cr.date), margin + usable/2 + 13, y + 5)
  doc.setFont("helvetica", "bold"); doc.setTextColor(...GRIS)
  doc.text("Phase :", margin + usable/2, y + 11); doc.setFont("helvetica", "normal"); doc.setTextColor(...NOIR); doc.text(chantier?.phase || "—", margin + usable/2 + 15, y + 11)
  y += 22

  // Participants
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
  doc.text("PARTICIPANTS / PRÉSENTS", margin, y); y += 5
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...NOIR)
  const pLines = doc.splitTextToSize(cr.participants || "—", usable); doc.text(pLines, margin, y); y += pLines.length * 3.8 + 5

  // Résumé
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
  doc.text("RÉSUMÉ DES ÉCHANGES", margin, y); y += 4
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...NOIR)
  const rLines = doc.splitTextToSize(cr.resume || "—", usable - 6)
  const rH = rLines.length * 4 + 6
  doc.setDrawColor(226,232,240); doc.setLineWidth(0.3); doc.rect(margin, y, usable, rH)
  doc.text(rLines, margin + 3, y + 5); y += rH + 6

  // Décisions
  if (cr.decisions) {
    if (y > 240) { doc.addPage(); y = 20 }
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
    doc.text("DÉCISIONS & ACTIONS À MENER", margin, y); y += 4
    const dLines = doc.splitTextToSize(cr.decisions, usable - 6)
    const dH = dLines.length * 4 + 6
    doc.setFillColor(254, 243, 199); doc.roundedRect(margin, y, usable, dH, 1.5, 1.5, 'F')
    doc.setDrawColor(245, 158, 11); doc.setLineWidth(0.5); doc.line(margin, y, margin, y + dH)
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(146, 64, 14)
    doc.text(dLines, margin + 3, y + 5); y += dH + 6
  }

  // Diffusion
  if (y > 250) { doc.addPage(); y = 20 }
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLEU)
  doc.text("DIFFUSION", margin, y); y += 4
  doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS)
  doc.text("Ce compte rendu est diffusé aux participants et au maître d'ouvrage.", margin, y); y += 3.5
  doc.text("En l'absence de remarque dans un délai de 8 jours, il est réputé approuvé.", margin, y); y += 8

  // Signatures
  if (y > 240) { doc.addPage(); y = 20 }
  doc.setDrawColor(226,232,240); doc.setLineWidth(0.3); doc.line(margin, y, w - margin, y); y += 5
  const sw = (usable - 4) / 2
  ;[{ t:"Le Maître d'œuvre", n:ENT.nom }, { t:"Le Maître d'ouvrage", n:chantier?.client||"" }].forEach((s, i) => {
    const sx = margin + i * (sw + 4); doc.rect(sx, y, sw, 22)
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...NOIR); doc.text(s.t, sx + 3, y + 4)
    doc.setFont("helvetica", "normal"); doc.setTextColor(...GRIS); doc.text(s.n, sx + 3, y + 9)
    doc.setFontSize(6.5); doc.text("Date et signature :", sx + 3, y + 19)
  })
  y += 28
  pied(doc, w, margin, y)
  doc.save(`CR-${cr.numero || "X"}-${(chantier?.nom || "chantier").replace(/\s+/g, "_")}.pdf`)
}

// ═══════════════════════════════════════════
// GÉNÉRATEUR EXCEL — ORDRE DE SERVICE
// ═══════════════════════════════════════════
export function generateOSExcel(data) {
  // Build CSV content (universally compatible, opens in Excel)
  const prestations = data.prestations || []
  let totalHT = 0
  const rows = prestations.map(p => {
    const q = parseFloat(p.quantite)||0, pu = parseFloat(p.prix_unitaire)||0, tva = parseFloat(p.tva_taux)||20
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
  rows.forEach(r => { csv += `${r[0]};${r[1]};${r[2]};${r[3].toFixed(2)};${r[4]};${r[5].toFixed(2)};${r[6].toFixed(2)}\n` })
  csv += `\n`
  csv += `;;;;;Total HT;${totalHT.toFixed(2)}\n`
  csv += `;;;;;Total TVA;${totalTVA.toFixed(2)}\n`
  csv += `;;;;;TOTAL TTC;${(totalHT + totalTVA).toFixed(2)}\n`
  csv += `\n`
  if (data.observations) csv += `Observations;${data.observations}\n`
  if (data.conditions) csv += `Conditions;${data.conditions}\n`

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${data.numero || 'OS'}.csv`
  link.click()
}

// ═══════════════════════════════════════════
// GÉNÉRATEUR EXCEL — COMPTE RENDU
// ═══════════════════════════════════════════
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
  csv += `PARTICIPANTS\n`
  csv += `${cr.participants||""}\n`
  csv += `\n`
  csv += `RÉSUMÉ DES ÉCHANGES\n`
  csv += `"${(cr.resume||"").replace(/"/g, '""')}"\n`
  csv += `\n`
  csv += `DÉCISIONS & ACTIONS\n`
  csv += `"${(cr.decisions||"").replace(/"/g, '""')}"\n`
  csv += `\n`
  csv += `${ENT.nom};${ENT.adresse};${ENT.cpVille};SIRET ${ENT.siret}\n`

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `CR-${cr.numero||"X"}-${(chantier?.nom||"chantier").replace(/\s+/g, "_")}.csv`
  link.click()
}
