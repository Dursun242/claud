'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { SB, Icon, I, fmtDate, btnP, btnS, sel } from '../dashboards/shared'
import { Badge } from '../components'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { generatePhotoReportPdf } from '../generators'
import { supabase } from '../supabaseClient'

// Resize une image à max 1600px de large et retourne { base64, mediaType, width, height, originalSize, optimizedSize }
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const MAX_W = 1600
        let { width, height } = img
        if (width > MAX_W) {
          height = Math.round(height * (MAX_W / width))
          width = MAX_W
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error("Compression échouée")); return }
          const reader2 = new FileReader()
          reader2.onload = () => resolve({
            blob,
            base64: reader2.result,
            width,
            height,
            originalSize: file.size,
            optimizedSize: blob.size,
          })
          reader2.readAsDataURL(blob)
        }, 'image/jpeg', 0.85)
      }
      img.onerror = () => reject(new Error("Image illisible"))
      img.src = e.target.result
    }
    reader.onerror = () => reject(new Error("Lecture fichier échouée"))
    reader.readAsDataURL(file)
  })
}

// Fetch une image depuis une URL signée Supabase et retourne une data URL base64
async function fetchImageAsBase64(url) {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })
}

export default function PhotoReportsV({ data, m, reload }) {
  const { addToast } = useToast()
  const confirm = useConfirm()
  const [chantierId, setChantierId] = useState(data.chantiers[0]?.id || '')
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [editingPhoto, setEditingPhoto] = useState(null) // photo id being edited
  const [editDesc, setEditDesc] = useState('')
  const fileInputRef = useRef(null)

  // Charger les photos du chantier sélectionné
  useEffect(() => {
    if (!chantierId) { setPhotos([]); return }
    setLoading(true)
    supabase
      .from('chantier_photos')
      .select('*')
      .eq('chantier_id', chantierId)
      .order('date_photo', { ascending: false })
      .then(({ data: rows, error }) => {
        if (error) {
          console.error('[photos] load error:', error.message)
          setPhotos([])
        } else {
          setPhotos(rows || [])
        }
        setLoading(false)
      })
  }, [chantierId])

  // Résoudre les signed URLs pour les miniatures
  const [signedUrls, setSignedUrls] = useState({})
  useEffect(() => {
    if (photos.length === 0) { setSignedUrls({}); return }
    const paths = photos.map(p => p.url_storage).filter(Boolean)
    if (paths.length === 0) return
    supabase.storage.from('attachments')
      .createSignedUrls(paths, 3600)
      .then(({ data: urls }) => {
        const map = {}
        ;(urls || []).forEach(u => { if (u.signedUrl) map[u.path] = u.signedUrl })
        setSignedUrls(map)
      })
  }, [photos])

  const chantier = useMemo(() => data.chantiers.find(c => c.id === chantierId), [data.chantiers, chantierId])

  // ── Upload photo ──────────────────────────────────────────────
  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0 || !chantierId) return

    setUploading(true)
    let success = 0
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      try {
        const { blob, width, height, originalSize, optimizedSize } = await compressImage(file)
        const ext = 'jpg'
        const path = `photos/${chantierId}/${crypto.randomUUID()}.${ext}`

        // Upload vers Supabase Storage
        const { error: upErr } = await supabase.storage
          .from('attachments')
          .upload(path, blob, { contentType: 'image/jpeg' })
        if (upErr) throw upErr

        // Récupérer la session pour uploaded_by_user
        const { data: { session } } = await supabase.auth.getSession()

        // Insert metadata
        const { error: dbErr } = await supabase.from('chantier_photos').insert({
          chantier_id: chantierId,
          url_storage: path,
          description: '',
          largeur: width,
          hauteur: height,
          taille_originale: originalSize,
          taille_optimisee: optimizedSize,
          date_photo: new Date().toISOString().split('T')[0],
          uploaded_by_user: session?.user?.id || '00000000-0000-0000-0000-000000000000',
        })
        if (dbErr) throw dbErr
        success++
      } catch (err) {
        addToast('Erreur upload : ' + (err?.message || String(err)), 'error')
      }
    }
    if (success > 0) {
      addToast(`${success} photo${success > 1 ? 's' : ''} ajoutée${success > 1 ? 's' : ''}`, 'success')
      // Recharger les photos
      const { data: rows } = await supabase.from('chantier_photos').select('*').eq('chantier_id', chantierId).order('date_photo', { ascending: false })
      setPhotos(rows || [])
    }
    setUploading(false)
  }

  // ── Supprimer une photo ───────────────────────────────────────
  const handleDelete = async (photo) => {
    const ok = await confirm({
      title: 'Supprimer cette photo ?',
      message: photo.description || 'La photo sera définitivement supprimée.',
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    try {
      await supabase.storage.from('attachments').remove([photo.url_storage])
      await supabase.from('chantier_photos').delete().eq('id', photo.id)
      setPhotos(prev => prev.filter(p => p.id !== photo.id))
      addToast('Photo supprimée', 'success')
    } catch (err) {
      addToast('Erreur : ' + (err?.message || 'suppression impossible'), 'error')
    }
  }

  // ── Modifier la description ───────────────────────────────────
  const handleEditDesc = async (photo) => {
    try {
      await supabase.from('chantier_photos').update({ description: editDesc }).eq('id', photo.id)
      setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, description: editDesc } : p))
      setEditingPhoto(null)
      addToast('Description mise à jour', 'success')
    } catch (err) {
      addToast('Erreur : ' + (err?.message || 'mise à jour impossible'), 'error')
    }
  }

  // ── Générer le PDF ────────────────────────────────────────────
  const handleGeneratePdf = async () => {
    if (!chantier || photos.length === 0) return
    setGeneratingPdf(true)
    try {
      // 1. Récupérer toutes les signed URLs et les convertir en base64
      const photosWithBase64 = []
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i]
        const url = signedUrls[p.url_storage]
        let base64 = null
        if (url) {
          try { base64 = await fetchImageAsBase64(url) }
          catch { /* photo indisponible, sera un placeholder dans le PDF */ }
        }
        photosWithBase64.push({ ...p, base64 })
      }

      // 2. Générer le PDF
      await generatePhotoReportPdf(chantier, photosWithBase64)
      addToast(`Rapport photo PDF généré (${photos.length} photos)`, 'success')
    } catch (err) {
      addToast('Erreur PDF : ' + (err?.message || 'génération impossible'), 'error')
    } finally {
      setGeneratingPdf(false)
    }
  }

  return (
    <div>
      {/* Input file caché */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleUpload}
        style={{ display: 'none' }}
      />

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: m ? 18 : 24, fontWeight: 700 }}>Rapports Photo</h1>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
            {photos.length} photo{photos.length > 1 ? 's' : ''} pour ce chantier
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={chantierId}
            onChange={e => setChantierId(e.target.value)}
            style={{ ...sel, width: 'auto', maxWidth: m ? '100%' : 240, fontSize: 12 }}
          >
            {data.chantiers.map(c => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !chantierId}
            title="Prendre une photo ou choisir depuis la galerie"
            style={{
              ...btnP, fontSize: 12,
              opacity: (uploading || !chantierId) ? 0.6 : 1,
              cursor: (uploading || !chantierId) ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {uploading ? (
              <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #fff4', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />Upload…</>
            ) : '📸 Ajouter des photos'}
          </button>
          <button
            onClick={handleGeneratePdf}
            disabled={generatingPdf || photos.length === 0}
            title="Générer un rapport photo PDF pour ce chantier"
            style={{
              ...btnS, fontSize: 12,
              background: '#FEF2F2', color: '#DC2626', border: '1.5px solid #FECACA',
              opacity: (generatingPdf || photos.length === 0) ? 0.5 : 1,
              cursor: (generatingPdf || photos.length === 0) ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {generatingPdf ? (
              <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #FECACA', borderTopColor: '#DC2626', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />Génération…</>
            ) : '📄 Rapport PDF'}
          </button>
        </div>
      </div>

      {/* ── GALERIE ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #E2E8F0', borderTopColor: '#1E3A5F', borderRadius: '50%', animation: 'spin .9s linear infinite', margin: '0 auto 12px' }} />
          Chargement des photos…
        </div>
      ) : photos.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, padding: '40px 24px', textAlign: 'center', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
          <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}>📸</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 4 }}>Aucune photo pour ce chantier</div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 14 }}>
            Prends des photos directement depuis ton iPhone ou importe-les depuis ta galerie.
          </div>
          <button onClick={() => fileInputRef.current?.click()} disabled={!chantierId} style={{ ...btnP, fontSize: 12 }}>
            📸 Ajouter des photos
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: m ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 10 }}>
          {photos.map(photo => {
            const url = signedUrls[photo.url_storage]
            const isEditing = editingPhoto === photo.id
            return (
              <div key={photo.id} style={{
                background: '#fff', borderRadius: 10, overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
                display: 'flex', flexDirection: 'column',
              }}>
                {/* Image */}
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={url}
                      alt={photo.description || 'Photo chantier'}
                      style={{ width: '100%', height: m ? 140 : 180, objectFit: 'cover', display: 'block' }}
                    />
                  </a>
                ) : (
                  <div style={{ width: '100%', height: m ? 140 : 180, background: '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 14 }}>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                  </div>
                )}

                {/* Infos */}
                <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        value={editDesc}
                        onChange={e => setEditDesc(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleEditDesc(photo)}
                        placeholder="Légende de la photo…"
                        autoFocus
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid #3B82F6', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
                      />
                      <button onClick={() => handleEditDesc(photo)} style={{ background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>OK</button>
                      <button onClick={() => setEditingPhoto(null)} style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>✕</button>
                    </div>
                  ) : (
                    <div
                      onClick={() => { setEditingPhoto(photo.id); setEditDesc(photo.description || '') }}
                      style={{ fontSize: 12, fontWeight: 600, color: photo.description ? '#0F172A' : '#94A3B8', cursor: 'pointer', minHeight: 18 }}
                      title="Cliquer pour modifier la légende"
                    >
                      {photo.description || '+ Ajouter une légende…'}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#94A3B8' }}>
                    <span>{fmtDate(photo.date_photo)}</span>
                    <button
                      onClick={() => handleDelete(photo)}
                      title="Supprimer"
                      style={{ background: '#fff', border: '1px solid #FECACA', borderRadius: 5, padding: '3px 6px', cursor: 'pointer', color: '#DC2626', fontSize: 10, fontFamily: 'inherit' }}
                    >✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
