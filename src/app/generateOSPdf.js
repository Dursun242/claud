'use client'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

/**
 * Génère un PDF d'Ordre de Service
 * SARL ID MAÎTRISE — Maîtrise d'œuvre BTP
 */

const BLEU = [30, 58, 95]       // #1E3A5F
const BLEU_CLAIR = [59,130,246] // #3B82F6
const GRIS = [100,116,139]      // #64748B
const GRIS_CLAIR = [241,245,249]// #F1F5F9
const NOIR = [15,23,42]         // #0F172A

const ENTREPRISE = {
  nom: "SARL ID MAÎTRISE",
  activite: "Maîtrise d'œuvre - Ingénierie BTP",
  adresse: "9 Rue Henry Genestal",
  cpVille: "76600 LE HAVRE",
  email: "contact@id-maitrise.com",
  siret: "921 536 181 00024",
  assurance: "Décennale MIC Insurance - N° LUN2205206",
}

function fmtDate(d) {
  if (!d) return "—"
  try {
    const dt = new Date(d)
    return dt.toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric" })
  } catch { return d }
}

function fmtMoney(n) {
  return new Intl.NumberFormat("fr-FR", { style:"currency", currency:"EUR" }).format(n)
}

export function generateOSPdf(data) {
  const doc = new jsPDF('p', 'mm', 'a4')
  const w = doc.internal.pageSize.getWidth()
  const margin = 20
  const usable = w - margin * 2
  let y = 15

  // ─── EN-TÊTE ───
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...BLEU)
  doc.text(ENTREPRISE.nom, margin, y)
  y += 5
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...GRIS)
  doc.text(ENTREPRISE.activite, margin, y); y += 3.5
  doc.text(ENTREPRISE.adresse, margin, y); y += 3.5
  doc.text(ENTREPRISE.cpVille, margin, y); y += 3.5
  doc.text(`SIRET: ${ENTREPRISE.siret}`, margin, y); y += 3.5
  doc.text(ENTREPRISE.email, margin, y)

  // Numéro OS (droite)
  doc.setFontSize(20)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...BLEU)
  doc.text("ORDRE DE SERVICE", w - margin, 18, { align: "right" })
  doc.setFontSize(14)
  doc.setTextColor(...BLEU_CLAIR)
  doc.text(data.numero || "OS-XXXX", w - margin, 26, { align: "right" })

  // Ligne séparatrice
  y = 40
  doc.setDrawColor(...BLEU)
  doc.setLineWidth(0.8)
  doc.line(margin, y, w - margin, y)
  y += 6

  // ─── DATES (bandeau gris) ───
  doc.setFillColor(...GRIS_CLAIR)
  doc.roundedRect(margin, y, usable, 10, 2, 2, 'F')
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...NOIR)
  const col3 = usable / 3
  doc.setFont("helvetica", "bold")
  doc.text("Date d'émission : ", margin + 3, y + 6.5)
  doc.setFont("helvetica", "normal")
  doc.text(fmtDate(data.date_emission), margin + 32, y + 6.5)
  
  doc.setFont("helvetica", "bold")
  doc.text("Date d'intervention : ", margin + col3 + 3, y + 6.5)
  doc.setFont("helvetica", "normal")
  doc.text(fmtDate(data.date_intervention), margin + col3 + 38, y + 6.5)
  
  doc.setFont("helvetica", "bold")
  doc.text("Fin prévue : ", margin + col3 * 2 + 3, y + 6.5)
  doc.setFont("helvetica", "normal")
  doc.text(fmtDate(data.date_fin_prevue), margin + col3 * 2 + 25, y + 6.5)
  
  y += 16

  // ─── CHANTIER ───
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...BLEU)
  doc.text("CHANTIER", margin, y); y += 5
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...NOIR)
  doc.text(data.chantier || "—", margin, y); y += 4
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...GRIS)
  doc.text(data.adresse_chantier || "", margin, y); y += 8

  // ─── CLIENT & ARTISAN ───
  const halfW = (usable - 6) / 2
  
  // Client box
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.rect(margin, y, halfW, 30)
  doc.setFontSize(8)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...BLEU)
  doc.text("MAÎTRE D'OUVRAGE (Client)", margin + 3, y + 5)
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...NOIR)
  doc.text(data.client_nom || "—", margin + 3, y + 11)
  doc.setFontSize(7.5)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...GRIS)
  doc.text(data.client_adresse || "", margin + 3, y + 16)

  // Artisan box
  const artX = margin + halfW + 6
  doc.rect(artX, y, halfW, 30)
  doc.setFontSize(8)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...BLEU)
  doc.text("ENTREPRISE (Artisan)", artX + 3, y + 5)
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...NOIR)
  doc.text(data.artisan_nom || "—", artX + 3, y + 11)
  doc.setFontSize(7.5)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...GRIS)
  const artLines = [
    data.artisan_specialite || "",
    `Tél: ${data.artisan_tel || ""}`,
    `Email: ${data.artisan_email || ""}`,
    `SIRET: ${data.artisan_siret || ""}`,
  ].filter(Boolean)
  artLines.forEach((line, i) => {
    doc.text(line, artX + 3, y + 16 + i * 3.5)
  })

  y += 38

  // ─── PRESTATIONS ───
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...BLEU)
  doc.text("DÉTAIL DES PRESTATIONS", margin, y); y += 4

  const prestations = data.prestations || []
  let totalHT = 0
  const tvaMap = {}

  const tableBody = prestations.map(p => {
    const qte = parseFloat(p.quantite) || 0
    const pu = parseFloat(p.prix_unitaire) || 0
    const tva = parseFloat(p.tva_taux) || 20
    const ligneHT = qte * pu
    totalHT += ligneHT
    const tvaMontant = ligneHT * tva / 100
    tvaMap[tva] = (tvaMap[tva] || 0) + tvaMontant
    return [
      p.description || "",
      p.unite || "",
      qte.toString(),
      fmtMoney(pu),
      `${tva}%`,
      fmtMoney(ligneHT),
    ]
  })

  const totalTVA = Object.values(tvaMap).reduce((s, v) => s + v, 0)
  const totalTTC = totalHT + totalTVA

  doc.autoTable({
    startY: y,
    head: [["Description", "Unité", "Qté", "PU HT", "TVA", "Total HT"]],
    body: tableBody,
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: BLEU,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: NOIR,
    },
    alternateRowStyles: {
      fillColor: GRIS_CLAIR,
    },
    columnStyles: {
      0: { cellWidth: usable * 0.35 },
      1: { cellWidth: usable * 0.10, halign: 'center' },
      2: { cellWidth: usable * 0.08, halign: 'center' },
      3: { cellWidth: usable * 0.15, halign: 'right' },
      4: { cellWidth: usable * 0.10, halign: 'center' },
      5: { cellWidth: usable * 0.18, halign: 'right' },
    },
    styles: {
      lineWidth: 0.2,
      lineColor: [226, 232, 240],
    },
  })

  y = doc.lastAutoTable.finalY + 4

  // ─── TOTAUX ───
  const totStartX = margin + usable * 0.55
  const totW = usable * 0.45

  // Total HT
  doc.setDrawColor(...BLEU)
  doc.setLineWidth(0.4)
  doc.line(totStartX, y, w - margin, y)
  y += 5
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...NOIR)
  doc.text("Total HT", totStartX, y)
  doc.text(fmtMoney(totalHT), w - margin, y, { align: "right" })
  y += 5

  // TVA lines
  doc.setFont("helvetica", "normal")
  Object.entries(tvaMap).sort().forEach(([taux, montant]) => {
    doc.text(`TVA ${taux}%`, totStartX, y)
    doc.text(fmtMoney(montant), w - margin, y, { align: "right" })
    y += 5
  })

  // Total TTC
  doc.setDrawColor(...BLEU)
  doc.setLineWidth(0.6)
  doc.line(totStartX, y, w - margin, y)
  y += 1
  doc.setFillColor(238, 242, 255) // #EEF2FF
  doc.rect(totStartX, y, totW, 8, 'F')
  y += 6
  doc.setFontSize(12)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...BLEU)
  doc.text("TOTAL TTC", totStartX + 2, y)
  doc.text(fmtMoney(totalTTC), w - margin - 2, y, { align: "right" })
  y += 10

  // ─── OBSERVATIONS ───
  if (data.observations) {
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...BLEU)
    doc.text("OBSERVATIONS", margin, y); y += 5
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...NOIR)
    const obsLines = doc.splitTextToSize(data.observations, usable)
    doc.text(obsLines, margin, y)
    y += obsLines.length * 3.5 + 4
  }

  // ─── CONDITIONS ───
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...BLEU)
  doc.text("CONDITIONS DE PAIEMENT", margin, y); y += 5
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...NOIR)
  const condLines = doc.splitTextToSize(data.conditions || "Paiement à 30 jours.", usable)
  doc.text(condLines, margin, y)
  y += condLines.length * 3.5 + 8

  // ─── SIGNATURES ───
  if (y > 240) { doc.addPage(); y = 20 }
  
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.line(margin, y, w - margin, y)
  y += 6

  const sigW = (usable - 8) / 3
  const sigs = [
    { title: "Le Maître d'œuvre", name: ENTREPRISE.nom },
    { title: "L'Entreprise", name: data.artisan_nom || "" },
    { title: "Le Maître d'ouvrage", name: data.client_nom || "" },
  ]

  sigs.forEach((sig, i) => {
    const sx = margin + i * (sigW + 4)
    doc.rect(sx, y, sigW, 28)
    doc.setFontSize(8)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...NOIR)
    doc.text(sig.title, sx + 3, y + 5)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...GRIS)
    doc.text(sig.name, sx + 3, y + 10)
    doc.setFontSize(7)
    doc.text("Date et signature :", sx + 3, y + 24)
  })

  y += 36

  // ─── PIED DE PAGE ───
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.2)
  doc.line(margin, y, w - margin, y)
  y += 4
  doc.setFontSize(6.5)
  doc.setTextColor(148, 163, 184)
  doc.text(
    `${ENTREPRISE.nom} — ${ENTREPRISE.adresse}, ${ENTREPRISE.cpVille} — SIRET ${ENTREPRISE.siret} — ${ENTREPRISE.assurance}`,
    w / 2, y, { align: "center" }
  )

  // ─── SAVE ───
  doc.save(`${data.numero || 'OS'}.pdf`)

  return { totalHT, totalTVA, totalTTC }
}
