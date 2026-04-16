// Générer un PDF de procès-verbal de réception pour signature Odoo

export function generatePVPdfBase64(pvData) {
  // Format: PDF simple en text (à améliorer avec jsPDF si besoin)
  const {
    titre,
    description,
    dateReception,
    signataireMoeEmail,
    signataireMotEmail,
    signataireEntrepriseEmail,
    decision,
    motifRefus,
    reservesAcceptation
  } = pvData

  const today = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })

  let content = `
================================================================================
                   PROCÈS-VERBAL DE RÉCEPTION
================================================================================

Titre:              ${titre}
Date de création:   ${today}
Date de réception:  ${dateReception || 'Non spécifiée'}

================================================================================
                        DESCRIPTION
================================================================================

${description || 'Aucune description'}

================================================================================
                        SIGNATAIRES
================================================================================

Maître d'Œuvre (MOE):
Email: ${signataireMoeEmail || 'Non renseigné'}
Signature: ________________________     Date: ________________

Maître d'Ouvrage (MOA):
Email: ${signataireMotEmail || 'Non renseigné'}
Signature: ________________________     Date: ________________

Entreprise:
Email: ${signataireEntrepriseEmail || 'Non renseigné'}
Signature: ________________________     Date: ________________
`

  if (decision) {
    content += `
================================================================================
                        DÉCISION
================================================================================

Statut: ${decision}
`
    if (decision === 'Accepté avec réserve' && reservesAcceptation) {
      content += `
Réserves:
${reservesAcceptation}
`
    }
    if (decision === 'Refusé' && motifRefus) {
      content += `
Motif de refus:
${motifRefus}
`
    }
  } else {
    content += `
================================================================================
                   À REMPLIR LORS DE LA RÉCEPTION
================================================================================

Statut de réception:
☐ Accepté (sans réserve)
☐ Accepté avec réserve (préciser ci-dessous)
☐ Refusé (préciser ci-dessous)

Observations/Réserves:
________________________________________________________________________________
________________________________________________________________________________

Motif de refus (si refusé):
________________________________________________________________________________
________________________________________________________________________________
`
  }

  content += `
================================================================================
Généré le ${today}
Document à conserver pour les archives
================================================================================`

  // Convertir en base64 (simple, pas de vraie génération PDF)
  // Note: Pour une vraie génération PDF, utiliser jsPDF
  const encoded = btoa(unescape(encodeURIComponent(content)))
  return encoded
}

// Alternative: Si jsPDF est disponible
export async function generatePVPdfWithJsPdf(pvData) {
  try {
    // Vérifier si jsPDF est disponible côté client
    if (typeof window !== 'undefined' && window.jsPDF) {
      const jsPDF = window.jsPDF.jsPDF
      const doc = new jsPDF()

      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      let yPos = 20

      // En-tête
      doc.setFontSize(16)
      doc.text('PROCÈS-VERBAL DE RÉCEPTION', pageWidth / 2, yPos, { align: 'center' })
      yPos += 15

      // Infos
      doc.setFontSize(10)
      doc.text(`Référence: ${pvData.numero}`, 20, yPos)
      yPos += 6
      doc.text(`Titre: ${pvData.titre}`, 20, yPos)
      yPos += 6
      doc.text(`Date: ${pvData.dateReception || new Date().toLocaleDateString('fr-FR')}`, 20, yPos)
      yPos += 12

      // Description
      if (pvData.description) {
        doc.setFontSize(10)
        doc.text('Description:', 20, yPos)
        yPos += 6
        const splitDescription = doc.splitTextToSize(pvData.description, pageWidth - 40)
        doc.text(splitDescription, 20, yPos)
        yPos += splitDescription.length * 5 + 10
      }

      // Signataires
      doc.setFontSize(11)
      doc.text('Signataires:', 20, yPos)
      yPos += 8

      doc.setFontSize(9)
      if (pvData.signataireMoeEmail) {
        doc.text(`MOE: ${pvData.signataireMoeEmail}`, 25, yPos)
        yPos += 5
      }
      if (pvData.signataireMotEmail) {
        doc.text(`MOA: ${pvData.signataireMotEmail}`, 25, yPos)
        yPos += 5
      }
      if (pvData.signataireEntrepriseEmail) {
        doc.text(`Entreprise: ${pvData.signataireEntrepriseEmail}`, 25, yPos)
        yPos += 5
      }

      // Convertir en base64
      const pdfData = doc.output('arraybuffer')
      const binary = new Uint8Array(pdfData)
      let binaryString = ''
      for (let i = 0; i < binary.length; i++) {
        binaryString += String.fromCharCode(binary[i])
      }
      return btoa(binaryString)
    }
  } catch (err) {
    console.warn('jsPDF non disponible, fallback à text:', err.message)
  }

  // Fallback sur la génération simple
  return generatePVPdfBase64(pvData)
}
