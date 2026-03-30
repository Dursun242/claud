'use client'
import { useState } from 'react'
import { photoService } from '@/app/services/photoService'
import { useToast } from '@/app/contexts/ToastContext'

/**
 * Uploadeur de photos avec compression automatique
 * Réduit la taille tout en gardant la qualité
 */
export default function PhotoUploader({ chantierId, crId = null, userId = null, onPhotoUploaded = null }) {
  const { addToast } = useToast()
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [lastStats, setLastStats] = useState(null)

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Vérifier le type
    if (!file.type.startsWith('image/')) {
      addToast('Veuillez sélectionner une image', 'warning')
      return
    }

    setUploading(true)
    setProgress(0)

    try {
      // 1. Compresser l'image
      setProgress(30)
      const compressed = await photoService.compressImage(
        file,
        1200, // maxWidth
        1200, // maxHeight
        0.8   // quality (0-1)
      )

      // 2. Uploader vers Storage
      setProgress(60)
      const storagePath = await photoService.uploadToStorage(
        chantierId,
        crId,
        compressed.blob,
        file.name
      )

      // 3. Obtenir l'URL publique
      setProgress(80)
      const publicUrl = await photoService.getPublicUrl(storagePath)

      // 4. Sauvegarder les métadonnées
      setProgress(90)
      const metadata = await photoService.savePhotoMetadata(
        chantierId,
        crId,
        storagePath,
        file.name.split('.')[0],
        userId,
        compressed.width,
        compressed.height,
        compressed.sizeOriginal,
        compressed.sizeOptimized
      )

      setProgress(100)
      setLastStats(photoService.getCompressionStats(
        compressed.sizeOriginal,
        compressed.sizeOptimized
      ))

      if (onPhotoUploaded) {
        onPhotoUploaded(publicUrl, metadata)
      }

      // Reset après succès
      setTimeout(() => {
        setUploading(false)
        setProgress(0)
        e.target.value = ''
      }, 1000)
    } catch (err) {
      console.error('Erreur upload:', err)
      addToast('Erreur: ' + err.message, 'error')
      setUploading(false)
      setProgress(0)
    }
  }

  return (
    <div style={{
      background: '#F9FAFB',
      border: '2px dashed #D1D5DB',
      borderRadius: '8px',
      padding: '24px',
      textAlign: 'center',
      cursor: uploading ? 'not-allowed' : 'pointer',
      opacity: uploading ? 0.6 : 1,
    }}>
      <input
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        disabled={uploading}
        style={{ display: 'none' }}
        id="photo-input"
      />

      <label
        htmlFor="photo-input"
        style={{
          display: 'block',
          cursor: uploading ? 'not-allowed' : 'pointer',
        }}
      >
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>📸</div>
        <p style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
          {uploading ? 'Upload en cours...' : 'Cliquez pour ajouter une photo'}
        </p>
        <p style={{ fontSize: '12px', color: '#6B7280' }}>
          {uploading
            ? `${progress}%`
            : 'Les images seront compressées pour rester légères'}
        </p>

        {/* Barre de progression */}
        {uploading && (
          <div style={{
            background: '#E5E7EB',
            borderRadius: '4px',
            height: '4px',
            marginTop: '12px',
            overflow: 'hidden',
          }}>
            <div
              style={{
                background: '#3B82F6',
                height: '100%',
                width: `${progress}%`,
                transition: 'width 0.3s',
              }}
            />
          </div>
        )}
      </label>

      {/* Stats de compression */}
      {lastStats && !uploading && (
        <div style={{
          marginTop: '12px',
          padding: '8px 12px',
          background: '#D1FAE5',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#047857',
        }}>
          ✅ {lastStats.sizeOrig} → {lastStats.sizeOpt} ({lastStats.reduction}% réduit)
        </div>
      )}
    </div>
  )
}
