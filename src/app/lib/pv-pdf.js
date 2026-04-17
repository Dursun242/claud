// Générer un PDF de procès-verbal de réception professionnel pour signature Odoo

export async function generatePVPdfBase64(pvData) {
  try {
    const jsPDF = (await import('jspdf')).jsPDF
    const doc = new jsPDF()

    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 15
    let yPos = 12

    // === EN-TÊTE AVEC LOGO ===
    // Logo ampoule stylisée + texte
    const logoSize = 12
    doc.setFont(undefined, 'bold')
    doc.setFontSize(16)
    doc.setTextColor(0, 0, 0)

    // Texte du logo avec accent
    doc.text('id', margin, yPos + 5)
    doc.setTextColor(200, 100, 0)
    doc.text('Maîtrise', margin + 8, yPos + 5)

    doc.setTextColor(100, 100, 100)
    doc.setFontSize(9)
    doc.setFont(undefined, 'normal')
    doc.text('Ingénierie de la construction', margin, yPos + 9)

    yPos += 15

    // Ligne décorative haute
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(1)
    doc.line(margin, yPos - 2, pageWidth - margin, yPos - 2)

    // Infos MOE à droite
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(8)
    const rightCol = pageWidth - margin - 50
    doc.text('contact@id-maitrise.com', rightCol, yPos - 7)
    doc.text('www.id-maitrise.com', rightCol, yPos - 3)

    yPos += 6

    // Séparateur
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 8

    // === TITRE PRINCIPAL ===
    doc.setFontSize(16)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('PROCÈS-VERBAL DE RÉCEPTION', pageWidth / 2, yPos, { align: 'center' })
    yPos += 10

    // === SECTION DOCUMENT ===
    const sectionColor = [200, 100, 0]
    const sectionBgColor = [255, 250, 240]

    function addSection(title) {
      doc.setFillColor(...sectionBgColor)
      doc.rect(margin - 2, yPos - 3, pageWidth - 2 * margin + 4, 6, 'F')
      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(...sectionColor)
      doc.text(title, margin, yPos + 1)
      doc.setDrawColor(...sectionColor)
      doc.setLineWidth(0.5)
      doc.line(margin, yPos + 2.5, pageWidth - margin, yPos + 2.5)
      yPos += 7
    }

    addSection('DOCUMENT')

    doc.setFont(undefined, 'normal')
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(9)

    doc.text('Numéro :', margin, yPos)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(200, 100, 0)
    doc.text(pvData.numero || '—', margin + 25, yPos)
    yPos += 5

    doc.setFont(undefined, 'normal')
    doc.setTextColor(0, 0, 0)
    doc.text('Titre :', margin, yPos)
    doc.setFont(undefined, 'bold')
    const titleLines = doc.splitTextToSize(pvData.titre || '', pageWidth - margin - 35)
    doc.text(titleLines, margin + 25, yPos)
    yPos += titleLines.length * 4 + 2

    doc.setFont(undefined, 'normal')
    doc.text('Date :', margin, yPos)
    doc.setFont(undefined, 'bold')
    doc.text(pvData.dateReception || new Date().toLocaleDateString('fr-FR'), margin + 25, yPos)
    yPos += 7

    // Description si présente
    if (pvData.description?.trim()) {
      doc.setFont(undefined, 'normal')
      doc.text('Description :', margin, yPos)
      yPos += 4
      doc.setFontSize(8.5)
      doc.setTextColor(80, 80, 80)
      const descLines = doc.splitTextToSize(pvData.description, pageWidth - margin * 2)
      doc.text(descLines, margin, yPos)
      yPos += descLines.length * 3.5 + 4
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(9)
    }

    yPos += 2

    // === SECTION SIGNATAIRES ===
    addSection('SIGNATAIRES')

    doc.setFont(undefined, 'normal')
    doc.setFontSize(9)

    const sigWidth = 45
    if (pvData.signataireMoeEmail) {
      doc.text('MOE :', margin, yPos)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(200, 100, 0)
      doc.text(pvData.signataireMoeEmail, margin + sigWidth, yPos)
      doc.setTextColor(0, 0, 0)
      doc.setFont(undefined, 'normal')
      yPos += 5
    }
    if (pvData.signataireMotEmail) {
      doc.text('MOA :', margin, yPos)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(200, 100, 0)
      doc.text(pvData.signataireMotEmail, margin + sigWidth, yPos)
      doc.setTextColor(0, 0, 0)
      doc.setFont(undefined, 'normal')
      yPos += 5
    }
    if (pvData.signataireEntrepriseEmail) {
      doc.text('Entreprise :', margin, yPos)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(200, 100, 0)
      doc.text(pvData.signataireEntrepriseEmail, margin + sigWidth, yPos)
      doc.setTextColor(0, 0, 0)
      doc.setFont(undefined, 'normal')
      yPos += 5
    }

    yPos += 3

    // === SECTION DÉCISION ===
    if (pvData.decision) {
      addSection('DÉCISION')

      doc.setFont(undefined, 'normal')
      doc.setFontSize(9)

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

      doc.setTextColor(...(decisionColors[pvData.decision] || [0, 0, 0]))
      doc.setFont(undefined, 'bold')
      doc.setFontSize(11)
      const emoji = decisionEmoji[pvData.decision] || '•'
      doc.text(`${emoji}  ${pvData.decision}`, margin, yPos)
      yPos += 6

      doc.setTextColor(0, 0, 0)
      doc.setFont(undefined, 'normal')
      doc.setFontSize(9)

      if (pvData.decision === 'Accepté avec réserve' && pvData.reservesAcceptation?.trim()) {
        doc.setFont(undefined, 'bold')
        doc.text('Réserves :', margin, yPos)
        yPos += 3
        doc.setFont(undefined, 'normal')
        doc.setFontSize(8.5)
        const reserveLines = doc.splitTextToSize(pvData.reservesAcceptation, pageWidth - margin * 2)
        doc.text(reserveLines, margin, yPos)
        yPos += reserveLines.length * 3.5 + 3
      }

      if (pvData.decision === 'Refusé' && pvData.motifRefus?.trim()) {
        doc.setFont(undefined, 'bold')
        doc.text('Motif :', margin, yPos)
        yPos += 3
        doc.setFont(undefined, 'normal')
        doc.setFontSize(8.5)
        const motifLines = doc.splitTextToSize(pvData.motifRefus, pageWidth - margin * 2)
        doc.text(motifLines, margin, yPos)
        yPos += motifLines.length * 3.5 + 3
      }

      yPos += 5
    }

    yPos += 3

    // === SECTION SIGNATURES ===
    addSection('SIGNATURES')

    doc.setFont(undefined, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(0, 0, 0)

    const colWidth = (pageWidth - margin * 2) / 3
    const signCol1 = margin
    const signCol2 = margin + colWidth
    const signCol3 = margin + colWidth * 2
    const signBoxHeight = 22

    // Cadres signature
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.3)
    doc.rect(signCol1, yPos, colWidth - 2, signBoxHeight)
    doc.rect(signCol2, yPos, colWidth - 2, signBoxHeight)
    doc.rect(signCol3, yPos, colWidth - 2, signBoxHeight)

    // Libellés
    doc.setFont(undefined, 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...sectionColor)
    doc.text('Maître d\'œuvre', signCol1 + 2, yPos + signBoxHeight + 2)
    doc.text('Maître d\'ouvrage', signCol2 + 2, yPos + signBoxHeight + 2)
    doc.text('Entreprise', signCol3 + 2, yPos + signBoxHeight + 2)

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
