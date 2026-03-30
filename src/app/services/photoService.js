'use client'
import { supabase } from '@/app/supabaseClient'

/**
 * Service pour gérer les photos chantier
 * Upload + Compression + Optimisation
 */

export const photoService = {
  // ─── COMPRESSION ───
  async compressImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (e) => {
        const img = new Image()
        img.src = e.target.result
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height

          // Calculer les nouvelles dimensions
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width)
              width = maxWidth
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height)
              height = maxHeight
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)

          canvas.toBlob(
            (blob) => {
              resolve({
                blob,
                width,
                height,
                sizeOriginal: file.size,
                sizeOptimized: blob.size,
              })
            },
            'image/jpeg',
            quality
          )
        }
        img.onerror = () => reject(new Error('Erreur chargement image'))
      }
      reader.onerror = () => reject(new Error('Erreur lecture fichier'))
    })
  },

  // ─── UPLOAD ───
  async uploadToStorage(chantierId, crId, compressedBlob, fileName) {
    const timestamp = Date.now()
    const path = crId
      ? `chantier-${chantierId}/cr-${crId}/${timestamp}-${fileName}`
      : `chantier-${chantierId}/${timestamp}-${fileName}`

    const { data, error } = await supabase.storage
      .from('chantier-photos')
      .upload(path, compressedBlob, {
        cacheControl: '3600',
        upsert: false,
      })

    if (error) throw error
    return path
  },

  async getPublicUrl(storagePath) {
    const { data } = supabase.storage
      .from('chantier-photos')
      .getPublicUrl(storagePath)
    return data?.publicUrl
  },

  // ─── DATABASE ───
  async savePhotoMetadata(chantierId, crId, storagePath, description, userId, width, height, sizeOrig, sizeOpt) {
    const { data, error } = await supabase
      .from('chantier_photos')
      .insert({
        chantier_id: chantierId,
        cr_id: crId || null,
        url_storage: storagePath,
        description: description || '',
        largeur: width,
        hauteur: height,
        taille_originale: sizeOrig,
        taille_optimisee: sizeOpt,
        uploaded_by_user: userId,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  // ─── READ ───
  async getChantierPhotos(chantierId) {
    const { data, error } = await supabase
      .from('chantier_photos')
      .select('*')
      .eq('chantier_id', chantierId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async getCRPhotos(crId) {
    const { data, error } = await supabase
      .from('chantier_photos')
      .select('*')
      .eq('cr_id', crId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  // ─── DELETE ───
  async deletePhoto(storagePath, photoId) {
    // Supprimer du storage
    const { error: storageError } = await supabase.storage
      .from('chantier-photos')
      .remove([storagePath])
    if (storageError) console.error('Erreur suppression storage:', storageError)

    // Supprimer de la BD
    const { error: dbError } = await supabase
      .from('chantier_photos')
      .delete()
      .eq('id', photoId)
    if (dbError) throw dbError
  },

  // ─── HELPER ───
  getCompressionStats(sizeOrig, sizeOpt) {
    const percent = Math.round(((sizeOrig - sizeOpt) / sizeOrig) * 100)
    return {
      reduction: percent,
      sizeOrig: formatBytes(sizeOrig),
      sizeOpt: formatBytes(sizeOpt),
    }
  },
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}
