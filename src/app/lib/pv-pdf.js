// Générer un PDF de procès-verbal de réception pour signature Odoo

export async function generatePVPdfBase64(pvData) {
  // Tenter de générer un vrai PDF avec jsPDF
  try {
    const jsPDF = (await import('jspdf')).jsPDF
    const doc = new jsPDF()

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    let yPos = 20

    // Titre
    doc.setFontSize(16)
    doc.setFont(undefined, 'bold')
    doc.text('PROCÈS-VERBAL DE RÉCEPTION', pageWidth / 2, yPos, { align: 'center' })
    yPos += 15

    // Infos
    doc.setFontSize(11)
    doc.setFont(undefined, 'normal')
    doc.text(`Titre: ${pvData.titre}`, 20, yPos)
    yPos += 7
    doc.text(`Date: ${pvData.dateReception || new Date().toLocaleDateString('fr-FR')}`, 20, yPos)
    yPos += 12

    // Description
    if (pvData.description) {
      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.text('Description:', 20, yPos)
      yPos += 6
      doc.setFont(undefined, 'normal')
      const splitDescription = doc.splitTextToSize(pvData.description, pageWidth - 40)
      doc.text(splitDescription, 20, yPos)
      yPos += splitDescription.length * 5 + 10
    }

    // Signataires
    doc.setFontSize(11)
    doc.setFont(undefined, 'bold')
    doc.text('Signataires:', 20, yPos)
    yPos += 8

    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    if (pvData.signataireMoeEmail) {
      doc.text(`MOE: ${pvData.signataireMoeEmail}`, 25, yPos)
      yPos += 6
    }
    if (pvData.signataireMotEmail) {
      doc.text(`MOA: ${pvData.signataireMotEmail}`, 25, yPos)
      yPos += 6
    }
    if (pvData.signataireEntrepriseEmail) {
      doc.text(`Entreprise: ${pvData.signataireEntrepriseEmail}`, 25, yPos)
      yPos += 6
    }

    yPos += 5

    // Décision
    if (pvData.decision) {
      doc.setFontSize(11)
      doc.setFont(undefined, 'bold')
      doc.text('Décision:', 20, yPos)
      yPos += 7

      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      doc.text(`Statut: ${pvData.decision}`, 25, yPos)
      yPos += 7

      if (pvData.decision === 'Accepté avec réserve' && pvData.reservesAcceptation) {
        doc.setFont(undefined, 'bold')
        doc.text('Réserves:', 25, yPos)
        yPos += 6
        doc.setFont(undefined, 'normal')
        const splitReserves = doc.splitTextToSize(pvData.reservesAcceptation, pageWidth - 45)
        doc.text(splitReserves, 25, yPos)
        yPos += splitReserves.length * 5
      }

      if (pvData.decision === 'Refusé' && pvData.motifRefus) {
        doc.setFont(undefined, 'bold')
        doc.text('Motif de refus:', 25, yPos)
        yPos += 6
        doc.setFont(undefined, 'normal')
        const splitMotif = doc.splitTextToSize(pvData.motifRefus, pageWidth - 45)
        doc.text(splitMotif, 25, yPos)
      }
    }

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
