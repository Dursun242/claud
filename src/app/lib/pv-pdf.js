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
    const margin = 15
    let yPos = 8

    // === BANDE HAUTE NOIRE ===
    doc.setFillColor(0, 0, 0)
    doc.rect(0, 0, pageWidth, 3, 'F')

    // === EN-TÊTE PROFESSIONNEL ===
    doc.setFillColor(245, 245, 245)
    doc.rect(0, 3, pageWidth, 24, 'F')

    // Logo + Texte
    doc.setFontSize(16)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('id', margin + 2, yPos + 9)

    doc.setTextColor(210, 105, 30)
    doc.text('Maîtrise', margin + 8, yPos + 9)

    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.setFont(undefined, 'normal')
    doc.text('Ingénierie de la construction', margin + 2, yPos + 13)

    // Infos MOE à droite
    doc.setFontSize(8)
    doc.setTextColor(50, 50, 50)
    const rightX = pageWidth - margin - 50
    doc.setFont(undefined, 'bold')
    doc.text('ID MAÎTRISE', rightX, yPos + 7)
    doc.setFont(undefined, 'normal')
    doc.setFontSize(7.5)
    doc.text('contact@id-maitrise.com', rightX, yPos + 11)
    doc.text('www.id-maitrise.com', rightX, yPos + 14)

    yPos = 32

    // === TITRE CENTRÉ ===
    doc.setFontSize(13)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('PROCÈS-VERBAL DE RÉCEPTION DES TRAVAUX', pageWidth / 2, yPos, { align: 'center' })
    yPos += 10

    // === TEXTE JURIDIQUE INTRO ===
    doc.setFontSize(9)
    doc.setFont(undefined, 'normal')
    doc.setTextColor(0, 0, 0)

    const introText = `Je, soussigné : ${pvData.signataireMotEmail || '......................................'}, maître d'ouvrage, après avoir procédé à la visite des travaux effectués par l'entreprise :`
    const introLines = doc.splitTextToSize(introText, pageWidth - margin * 2)
    doc.text(introLines, margin, yPos)
    yPos += introLines.length * 4 + 3

    const entrepriseText = pvData.signataireMoeEmail || '......................................'
    const entLines = doc.splitTextToSize(entrepriseText, pageWidth - margin * 2)
    doc.text(entLines, margin, yPos)
    yPos += entLines.length * 4 + 4

    // Titre du marché
    doc.text(`au titre du marché faisant objet du devis N° ${pvData.numero || '......................'}`, margin, yPos)
    yPos += 5

    doc.text(`relatif aux travaux : ${pvData.titre || '......................................'}`, margin, yPos)
    yPos += 5

    doc.text(`en présence du représentant de l'entreprise : ${pvData.signataireEntrepriseEmail || '......................................'}`, margin, yPos)
    yPos += 5

    doc.setFont(undefined, 'bold')
    doc.text('déclare que :', margin, yPos)
    yPos += 6

    // === CASES À COCHER ===
    doc.setFont(undefined, 'normal')
    doc.setFontSize(8.5)

    const checkboxSize = 3
    const checkboxX = margin + 1

    // Case 1: Sans réserve
    doc.rect(checkboxX, yPos, checkboxSize, checkboxSize)
    if (pvData.decision === 'Accepté') {
      doc.setFont(undefined, 'bold')
      doc.text('✓', checkboxX + 0.8, yPos + 2.2)
      doc.setFont(undefined, 'normal')
    }
    doc.text('La réception est prononcée sans réserve, avec effet à la date du .......................', checkboxX + 6, yPos + 1.5)
    yPos += 5

    // Case 2: Avec réserve
    doc.rect(checkboxX, yPos, checkboxSize, checkboxSize)
    if (pvData.decision === 'Accepté avec réserve') {
      doc.setFont(undefined, 'bold')
      doc.text('✓', checkboxX + 0.8, yPos + 2.2)
      doc.setFont(undefined, 'normal')
    }
    const reserveText = 'La réception est prononcée avec réserve avec effet à la date du ....................... assortie des réserves mentionnées dans l\'état des réserves ci-joint. Si la réception est prononcée avec réserves, un état de ces dernières, jointes en page suivante, est dressé et précisé le délai dans lequel les travaux qu\'elles impliquent seront exécutés.'
    const reserveLines = doc.splitTextToSize(reserveText, pageWidth - margin - checkboxX - 8)
    doc.text(reserveLines, checkboxX + 6, yPos + 1.5)
    yPos += reserveLines.length * 3.2 + 2

    // Case 3: Refusée
    doc.rect(checkboxX, yPos, checkboxSize, checkboxSize)
    if (pvData.decision === 'Refusé') {
      doc.setFont(undefined, 'bold')
      doc.text('✓', checkboxX + 0.8, yPos + 2.2)
      doc.setFont(undefined, 'normal')
    }
    doc.text('La réception est refusée - différée pour les motifs suivants : (rayez la mention inutile)', checkboxX + 6, yPos + 1.5)
    yPos += 5

    if (pvData.decision === 'Refusé' && pvData.motifRefus?.trim()) {
      const motifLines = doc.splitTextToSize(pvData.motifRefus, pageWidth - margin * 2)
      doc.text(motifLines, margin, yPos)
      yPos += motifLines.length * 3.5 + 2
    } else {
      yPos += 8
    }

    yPos += 3

    // === TEXTE JURIDIQUE FIN ===
    doc.setFontSize(8.5)
    doc.setFont(undefined, 'bold')
    const garantiesText = 'Garanties : les garanties découlant des articles 1792, 1792-2 et 1792-3 du Code Civil commencent à courir à compter de la signature du présent procès-verbal.'
    const garantiesLines = doc.splitTextToSize(garantiesText, pageWidth - margin * 2)
    doc.text(garantiesLines, margin, yPos)
    yPos += garantiesLines.length * 3 + 2

    doc.setFont(undefined, 'normal')
    const signatureText = 'La signature du procès-verbal de réception et le règlement des travaux autorisent le client soussigné à prendre possession de l\'ouvrage.'
    const sigLines = doc.splitTextToSize(signatureText, pageWidth - margin * 2)
    doc.text(sigLines, margin, yPos)
    yPos += sigLines.length * 3 + 4

    doc.text(`Fait à ${pvData.dateReception || '..............................'} le ${pvData.dateReception || '.....................'}`, margin, yPos)
    yPos += 4

    doc.text('en .......... exemplaires, dont un est remis à chacune des parties.', margin, yPos)
    yPos += 8

    // === SIGNATURES FINALES ===
    const signColWidth = (pageWidth - margin * 2) / 2
    doc.setFontSize(9)
    doc.setFont(undefined, 'normal')
    doc.text('Signature de l\'entreprise', margin, yPos + 20)
    doc.text('Signature du maître de l\'ouvrage', margin + signColWidth, yPos + 20)

    // Boîtes signatures
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.5)
    doc.rect(margin, yPos, signColWidth - 2, 18)
    doc.rect(margin + signColWidth, yPos, signColWidth - 2, 18)

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
