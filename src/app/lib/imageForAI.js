// imageForAI.js — prépare une photo / capture d'écran pour l'analyse IA
// (import de contact, import de devis).
//
// Le plus grand côté est limité à 1568 px (taille recommandée par Anthropic :
// au-delà l'image est réduite côté serveur de toute façon, et au-delà de
// 8000 px elle est refusée). Avant, seule la largeur était limitée : une
// capture d'écran de téléphone, étroite mais très haute, partait telle
// quelle et pouvait être rejetée (« Erreur du service IA »).

export const AI_MAX_EDGE = 1568

/** Dimensions cibles : plus grand côté ≤ maxEdge, proportions conservées. */
export function fitWithin(width, height, maxEdge = AI_MAX_EDGE) {
  const longest = Math.max(width, height)
  if (!longest || longest <= maxEdge) return { width, height }
  const ratio = maxEdge / longest
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) }
}

/**
 * Lit un fichier image, le redimensionne et le convertit en JPEG.
 * @returns {Promise<{ base64: string, mediaType: 'image/jpeg' }>}
 */
export function resizeImageForAI(file, { maxEdge = AI_MAX_EDGE, quality = 0.85 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const { width, height } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height, maxEdge)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        // Fond blanc : les PNG transparents (captures) deviennent lisibles en JPEG
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        const base64 = dataUrl.split(',')[1]
        if (!base64) return reject(new Error('Conversion de l’image impossible'))
        resolve({ base64, mediaType: 'image/jpeg' })
      }
      img.onerror = () => reject(new Error('Image illisible (format non reconnu par le navigateur)'))
      img.src = e.target.result
    }
    reader.onerror = () => reject(new Error('Lecture du fichier échouée'))
    reader.readAsDataURL(file)
  })
}
