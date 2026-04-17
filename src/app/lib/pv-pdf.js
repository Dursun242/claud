// Générer un PDF de procès-verbal de réception professionnel pour signature Odoo

export async function generatePVPdfBase64(pvData) {
  try {
    const jsPDF = (await import('jspdf')).jsPDF
    const doc = new jsPDF()

    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    let yPos = 15

    // === EN-TÊTE MOE (ID MAÎTRISE) ===
    doc.setFontSize(10)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(0, 0, 0)

    // Placeholder pour logo - sera à intégrer avec l'image réelle
    doc.text('ID MAÎTRISE', margin, yPos)
    yPos += 3
    doc.setFontSize(9)
    doc.setFont(undefined, 'normal')
    doc.text('contact@id-maitrise.com', margin, yPos)
    yPos += 3
    doc.text('www.id-maitrise.com', margin, yPos)
    yPos += 8

    // Séparateur
    doc.setDrawColor(200, 200, 200)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 8

    // === TITRE PRINCIPAL ===
    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.text('PROCÈS-VERBAL DE RÉCEPTION', pageWidth / 2, yPos, { align: 'center' })
    yPos += 12

    // === SECTION ENTREPRISE ===
    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(50, 70, 150)
    doc.text('ENTREPRISE', margin, yPos)
    yPos += 1
    doc.setDrawColor(180, 180, 200)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 5

    doc.setFont(undefined, 'normal')
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(9)
    doc.text('Numéro PV :', margin, yPos)
    doc.text(pvData.numero || '—', margin + 35, yPos)
    yPos += 5
    doc.text('Titre :', margin, yPos)
    const titleLines = doc.splitTextToSize(pvData.titre || '', pageWidth - margin - 40)
    doc.text(titleLines, margin + 35, yPos)
    yPos += titleLines.length * 4 + 3

    doc.text('Date :', margin, yPos)
    doc.text(pvData.dateReception || new Date().toLocaleDateString('fr-FR'), margin + 35, yPos)
    yPos += 6

    // Description si présente
    if (pvData.description?.trim()) {
      doc.setFont(undefined, 'bold')
      doc.text('Description :', margin, yPos)
      yPos += 4
      doc.setFont(undefined, 'normal')
      const descLines = doc.splitTextToSize(pvData.description, pageWidth - margin * 2)
      doc.text(descLines, margin, yPos)
      yPos += descLines.length * 3.5 + 4
    }

    yPos += 3

    // === SECTION SIGNATAIRES ===
    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(50, 70, 150)
    doc.text('SIGNATAIRES', margin, yPos)
    yPos += 1
    doc.setDrawColor(180, 180, 200)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 5

    doc.setFont(undefined, 'normal')
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(9)

    if (pvData.signataireMoeEmail) {
      doc.text('Maître d\'œuvre (MOE) :', margin, yPos)
      doc.text(pvData.signataireMoeEmail, margin + 50, yPos)
      yPos += 5
    }
    if (pvData.signataireMotEmail) {
      doc.text('Maître d\'ouvrage (MOA) :', margin, yPos)
      doc.text(pvData.signataireMotEmail, margin + 50, yPos)
      yPos += 5
    }
    if (pvData.signataireEntrepriseEmail) {
      doc.text('Entreprise :', margin, yPos)
      doc.text(pvData.signataireEntrepriseEmail, margin + 50, yPos)
      yPos += 5
    }

    yPos += 5

    // === SECTION DÉCISION ===
    if (pvData.decision) {
      doc.setFontSize(9)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(50, 70, 150)
      doc.text('DÉCISION FINALE', margin, yPos)
      yPos += 1
      doc.setDrawColor(180, 180, 200)
      doc.line(margin, yPos, pageWidth - margin, yPos)
      yPos += 5

      doc.setFont(undefined, 'normal')
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(9)

      const decisionEmoji = {
        'Accepté': '✓',
        'Accepté avec réserve': '⚠',
        'Refusé': '✕'
      }
      const emoji = decisionEmoji[pvData.decision] || '•'

      doc.text(`Statut : ${emoji} ${pvData.decision}`, margin, yPos)
      yPos += 5

      if (pvData.decision === 'Accepté avec réserve' && pvData.reservesAcceptation?.trim()) {
        doc.setFont(undefined, 'bold')
        doc.text('Réserves mentionnées :', margin, yPos)
        yPos += 4
        doc.setFont(undefined, 'normal')
        const reserveLines = doc.splitTextToSize(pvData.reservesAcceptation, pageWidth - margin * 2)
        doc.text(reserveLines, margin, yPos)
        yPos += reserveLines.length * 3.5 + 4
      }

      if (pvData.decision === 'Refusé' && pvData.motifRefus?.trim()) {
        doc.setFont(undefined, 'bold')
        doc.text('Motif du refus :', margin, yPos)
        yPos += 4
        doc.setFont(undefined, 'normal')
        const motifLines = doc.splitTextToSize(pvData.motifRefus, pageWidth - margin * 2)
        doc.text(motifLines, margin, yPos)
        yPos += motifLines.length * 3.5 + 4
      }

      yPos += 8
    }

    // === SECTION SIGNATURES ===
    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(50, 70, 150)
    doc.text('SIGNATURES', margin, yPos)
    yPos += 1
    doc.setDrawColor(180, 180, 200)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 8

    doc.setFont(undefined, 'normal')
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(8)

    const colWidth = (pageWidth - margin * 2) / 3
    const signCol1 = margin
    const signCol2 = margin + colWidth
    const signCol3 = margin + colWidth * 2

    doc.text('Maître d\'œuvre', signCol1, yPos)
    doc.text('Maître d\'ouvrage', signCol2, yPos)
    doc.text('Entreprise', signCol3, yPos)
    yPos += 28

    doc.text('Date et signature', signCol1, yPos)
    doc.text('Date et signature', signCol2, yPos)
    doc.text('Date et signature', signCol3, yPos)

    // Convertir en base64
    const pdfData = doc.output('arraybuffer')
    const binary = new Uint8Array(pdfData)
    let binaryString = ''
    for (let i = 0; i < binary.length; i++) {
      binaryString += String.fromCharCode(binary[i])
    }
    return btoa(binaryString)
  } catch (err) {
    console.error('Erreur génération PDF:', err)
    throw new Error('Impossible de générer le PDF: ' + err.message)
  }
}
