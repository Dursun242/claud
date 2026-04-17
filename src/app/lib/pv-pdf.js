// Générer un PDF de procès-verbal de réception professionnel pour signature Odoo

function drawBulbIcon(doc, x, y, size) {
  const s = size / 20
  doc.setDrawColor(80, 80, 80)
  doc.setLineWidth(0.3)

  // Culot (spirale)
  doc.arc(x + 8 * s, y + 2 * s, 3 * s, 3 * s, 0, 360)

  // Corps ampoule
  doc.ellipse(x + 8 * s, y + 8 * s, 5 * s, 6 * s)

  // Rayons
  doc.line(x + 2 * s, y + 7 * s, x + 0.5 * s, y + 7 * s)
  doc.line(x + 14 * s, y + 7 * s, x + 15.5 * s, y + 7 * s)
  doc.line(x + 3 * s, y + 4 * s, x + 2 * s, y + 2.5 * s)
  doc.line(x + 13 * s, y + 4 * s, x + 14 * s, y + 2.5 * s)
}

export async function generatePVPdfBase64(pvData) {
  try {
    const jsPDF = (await import('jspdf')).jsPDF
    const doc = new jsPDF()

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 15
    let yPos = 10

    // === BANDE HAUTE NOIRE ===
    doc.setFillColor(0, 0, 0)
    doc.rect(0, 0, pageWidth, 3, 'F')

    // === EN-TÊTE PROFESSIONNEL ===
    doc.setFillColor(245, 245, 245)
    doc.rect(0, 3, pageWidth, 28, 'F')

    // Logo + Texte
    doc.setFontSize(18)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('id', margin + 2, yPos + 10)

    doc.setTextColor(210, 105, 30)
    doc.text('Maîtrise', margin + 11, yPos + 10)

    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.setFont(undefined, 'normal')
    doc.text('Ingénierie de la construction', margin + 2, yPos + 15)

    // Infos MOE à droite
    doc.setFontSize(9)
    doc.setTextColor(50, 50, 50)
    const rightX = pageWidth - margin - 55
    doc.setFont(undefined, 'bold')
    doc.text('ID MAÎTRISE', rightX, yPos + 8)
    doc.setFont(undefined, 'normal')
    doc.setFontSize(8)
    doc.text('contact@id-maitrise.com', rightX, yPos + 13)
    doc.text('www.id-maitrise.com', rightX, yPos + 17)

    yPos = 35

    // === NUMÉRO ET TITRE ===
    doc.setFontSize(24)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(210, 105, 30)
    doc.text('PV', margin, yPos)

    doc.setFontSize(12)
    doc.setTextColor(0, 0, 0)
    doc.text(pvData.numero || 'PV-XXXX-000', margin + 15, yPos)

    yPos += 12

    // === TITRE PRINCIPAL ===
    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(40, 40, 40)
    doc.text('PROCÈS-VERBAL DE RÉCEPTION', margin, yPos)
    yPos += 8

    // Séparateur
    doc.setDrawColor(210, 105, 30)
    doc.setLineWidth(1)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 8

    // === CONTENU PRINCIPALE ===
    doc.setFontSize(10)

    // Infos document
    doc.setFont(undefined, 'normal')
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(9)

    doc.text('Titre :', margin, yPos)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(210, 105, 30)
    const titleLines = doc.splitTextToSize(pvData.titre || '', pageWidth - margin - 35)
    doc.text(titleLines, margin + 25, yPos)
    yPos += titleLines.length * 4 + 2

    doc.setFont(undefined, 'normal')
    doc.setTextColor(0, 0, 0)
    doc.text('Date :', margin, yPos)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(210, 105, 30)
    doc.text(pvData.dateReception || new Date().toLocaleDateString('fr-FR'), margin + 25, yPos)
    yPos += 6

    // Description
    if (pvData.description?.trim()) {
      doc.setFont(undefined, 'normal')
      doc.setTextColor(0, 0, 0)
      doc.text('Description :', margin, yPos)
      yPos += 4
      doc.setFontSize(8.5)
      doc.setTextColor(80, 80, 80)
      const descLines = doc.splitTextToSize(pvData.description, pageWidth - margin * 2)
      doc.text(descLines, margin, yPos)
      yPos += descLines.length * 3.5 + 4
    }

    yPos += 4

    // === BOX SIGNATAIRES ===
    doc.setDrawColor(210, 105, 30)
    doc.setFillColor(255, 250, 240)
    doc.setLineWidth(1)
    doc.rect(margin, yPos, pageWidth - margin * 2, 25, 'FD')

    doc.setFont(undefined, 'bold')
    doc.setFontSize(10)
    doc.setTextColor(210, 105, 30)
    doc.text('SIGNATAIRES', margin + 3, yPos + 4)

    doc.setFont(undefined, 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(0, 0, 0)
    const colWidth = (pageWidth - margin * 2) / 3
    const sigX1 = margin + 2
    const sigX2 = margin + colWidth + 2
    const sigX3 = margin + colWidth * 2 + 2

    if (pvData.signataireMoeEmail) {
      doc.setFont(undefined, 'bold')
      doc.text('MOE', sigX1, yPos + 9)
      doc.setFont(undefined, 'normal')
      doc.setFontSize(8)
      doc.text(pvData.signataireMoeEmail, sigX1, yPos + 13)
    }
    if (pvData.signataireMotEmail) {
      doc.setFont(undefined, 'bold')
      doc.setFontSize(8.5)
      doc.text('MOA', sigX2, yPos + 9)
      doc.setFont(undefined, 'normal')
      doc.setFontSize(8)
      doc.text(pvData.signataireMotEmail, sigX2, yPos + 13)
    }
    if (pvData.signataireEntrepriseEmail) {
      doc.setFont(undefined, 'bold')
      doc.setFontSize(8.5)
      doc.text('Entreprise', sigX3, yPos + 9)
      doc.setFont(undefined, 'normal')
      doc.setFontSize(8)
      doc.text(pvData.signataireEntrepriseEmail, sigX3, yPos + 13)
    }

    yPos += 30

    // === DÉCISION ===
    if (pvData.decision) {
      const decisionColors = {
        'Accepté': [34, 139, 34],
        'Accepté avec réserve': [255, 140, 0],
        'Refusé': [220, 20, 60]
      }
      const decisionEmoji = {
        'Accepté': '✓',
        'Accepté avec réserve': '⚠',
        'Refusé': '✕'
      }
      const dColor = decisionColors[pvData.decision] || [0, 0, 0]

      doc.setDrawColor(...dColor)
      doc.setFillColor(255, 250, 240)
      doc.setLineWidth(1.5)
      doc.rect(margin, yPos, pageWidth - margin * 2, 20, 'FD')

      const emoji = decisionEmoji[pvData.decision] || '•'
      doc.setFont(undefined, 'bold')
      doc.setFontSize(12)
      doc.setTextColor(...dColor)
      doc.text(`${emoji}  ${pvData.decision}`, margin + 5, yPos + 7)

      if (pvData.decision === 'Accepté avec réserve' && pvData.reservesAcceptation?.trim()) {
        doc.setFont(undefined, 'bold')
        doc.setFontSize(8)
        doc.text('Réserves :', margin + 5, yPos + 12)
        doc.setFont(undefined, 'normal')
        doc.setFontSize(7.5)
        const rLines = doc.splitTextToSize(pvData.reservesAcceptation, pageWidth - margin * 2 - 10)
        doc.text(rLines, margin + 5, yPos + 15)
      } else if (pvData.decision === 'Refusé' && pvData.motifRefus?.trim()) {
        doc.setFont(undefined, 'bold')
        doc.setFontSize(8)
        doc.text('Motif :', margin + 5, yPos + 12)
        doc.setFont(undefined, 'normal')
        doc.setFontSize(7.5)
        const mLines = doc.splitTextToSize(pvData.motifRefus, pageWidth - margin * 2 - 10)
        doc.text(mLines, margin + 5, yPos + 15)
      }

      yPos += 25
    }

    yPos += 5

    // === SIGNATURES ===
    doc.setFont(undefined, 'bold')
    doc.setFontSize(9)
    doc.setTextColor(210, 105, 30)
    doc.text('SIGNATURES', margin, yPos)
    yPos += 8

    const signBoxHeight = 20
    const signColWidth = (pageWidth - margin * 2) / 3

    // Boîtes signatures
    doc.setDrawColor(150, 150, 150)
    doc.setLineWidth(0.5)
    doc.setFillColor(250, 250, 250)

    const sigBoxes = [
      { x: margin, label: 'Maître d\'œuvre' },
      { x: margin + signColWidth, label: 'Maître d\'ouvrage' },
      { x: margin + signColWidth * 2, label: 'Entreprise' }
    ]

    sigBoxes.forEach(box => {
      doc.rect(box.x, yPos, signColWidth - 2, signBoxHeight, 'FD')
      doc.setFont(undefined, 'bold')
      doc.setFontSize(8)
      doc.setTextColor(50, 50, 50)
      doc.text(box.label, box.x + 2, yPos + signBoxHeight + 2)
    })

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
