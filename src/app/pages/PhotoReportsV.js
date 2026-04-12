'use client'
import { useState, useMemo, useRef } from 'react'
import { fmtDate, btnP, btnS, sel } from '../dashboards/shared'
import { useToast } from '../contexts/ToastContext'
import { generatePhotoReportPdf } from '../generators'
import { supabase } from '../supabaseClient'

// Compresse une image à max 1600px de large et retourne une data URL base64
// Compression agressive pour garder le PDF < 2 Mo avec 10 photos :
// - Max 1200px de large (au lieu de 1600)
// - JPEG qualité 70% (au lieu de 85%)
// - Résultat ~80-150 KB par photo → 10 photos ≈ 1-1.5 Mo total
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const MAX_W = 1200
        let { width, height } = img
        if (width > MAX_W) {
          height = Math.round(height * (MAX_W / width))
          width = MAX_W
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        resolve({
          base64: canvas.toDataURL('image/jpeg', 0.70),
          width,
          height,
          name: file.name,
        })
      }
      img.onerror = () => reject(new Error("Image illisible"))
      img.src = e.target.result
    }
    reader.onerror = () => reject(new Error("Lecture fichier échouée"))
    reader.readAsDataURL(file)
  })
}

const MAX_PHOTOS = 10

export default function PhotoReportsV({ data, m }) {
  const { addToast } = useToast()
  const [chantierId, setChantierId] = useState(data.chantiers[0]?.id || '')
  const [photos, setPhotos] = useState([]) // [{ id, base64, description, date_photo, width, height }]
  const [loading, setLoading] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const fileInputRef = useRef(null)

  const chantier = useMemo(
    () => data.chantiers.find(c => c.id === chantierId),
    [data.chantiers, chantierId]
  )

  // ── Sélection de photos depuis la galerie ─────────────────────
  const handleSelectPhotos = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return

    // Vérifier la limite
    const remaining = MAX_PHOTOS - photos.length
    if (remaining <= 0) {
      addToast(`Maximum ${MAX_PHOTOS} photos par rapport`, 'warning')
      return
    }
    const selected = files.slice(0, remaining).filter(f => f.type.startsWith('image/'))
    if (selected.length === 0) return

    setLoading(true)
    const newPhotos = []
    for (const file of selected) {
      try {
        const { base64, width, height, name } = await compressImage(file)
        newPhotos.push({
          id: crypto.randomUUID(),
          base64,
          description: '',
          date_photo: new Date().toISOString().split('T')[0],
          width,
          height,
          name,
        })
      } catch (err) {
        addToast('Erreur : ' + (err?.message || 'photo illisible'), 'error')
      }
    }
    if (newPhotos.length > 0) {
      setPhotos(prev => [...prev, ...newPhotos])
      addToast(`${newPhotos.length} photo${newPhotos.length > 1 ? 's' : ''} ajoutée${newPhotos.length > 1 ? 's' : ''}`, 'success')
    }
    setLoading(false)
  }

  // ── Modifier la description ────────────────────────────────────
  const updateDesc = (id, desc) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, description: desc } : p))
  }

  // ── Supprimer une photo ────────────────────────────────────────
  const removePhoto = (id) => {
    setPhotos(prev => prev.filter(p => p.id !== id))
  }

  // ── Déplacer une photo (haut / bas) ────────────────────────────
  const movePhoto = (id, direction) => {
    setPhotos(prev => {
      const idx = prev.findIndex(p => p.id === id)
      if (idx < 0) return prev
      const newIdx = idx + direction
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]]
      return copy
    })
  }

  // ── Tout effacer ───────────────────────────────────────────────
  const clearAll = () => {
    setPhotos([])
    addToast('Photos effacées', 'info')
  }

  // ── Générer le PDF + sauvegarder en pièce jointe du chantier ──
  const handleGeneratePdf = async () => {
    if (!chantier || photos.length === 0) return
    setGeneratingPdf(true)
    try {
      // 1. Génère le PDF (télécharge automatiquement + retourne le blob)
      const { blob, filename } = await generatePhotoReportPdf(chantier, photos)

      // 2. Sauvegarder en pièce jointe du chantier via /api/upload
      //    (utilise le service role key côté serveur — contourne les
      //    policies RLS du bucket Storage qui bloquent l'upload direct)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const form = new FormData()
        // Utiliser form.append(name, blob, filename) au lieu de new File()
        // car le constructeur File() peut échouer sur certains navigateurs mobiles
        form.append('file', blob, filename)
        form.append('type', 'chantier')
        form.append('itemId', chantierId)

        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session?.access_token || ''}` },
          body: form,
        })

        if (res.ok) {
          addToast('Reportage PDF enregistré dans le dossier chantier', 'success')
        } else {
          const err = await res.json().catch(() => ({}))
          addToast('PDF téléchargé · Sauvegarde : ' + (err.error || `erreur ${res.status}`), 'warning', 5000)
        }
      } catch (saveErr) {
        addToast('PDF téléchargé · Sauvegarde : ' + (saveErr?.message || 'erreur réseau'), 'warning', 5000)
      }
    } catch (err) {
      addToast('Erreur PDF : ' + (err?.message || 'génération impossible'), 'error')
    } finally {
      setGeneratingPdf(false)
    }
  }

  return (
    <div>
      {/* Input file caché — multiple, accept image, pas de capture pour
          que iOS propose caméra + galerie + fichiers */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleSelectPhotos}
        style={{ display: 'none' }}
      />

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: m ? 18 : 24, fontWeight: 700 }}>Reportage Photo</h1>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
            Sélectionne jusqu'à {MAX_PHOTOS} photos puis génère le reportage PDF
          </div>
        </div>
      </div>

      {/* ── ÉTAPE 1 : Chantier ── */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: m ? 14 : 18,
        boxShadow: '0 1px 3px rgba(15,23,42,0.06)', marginBottom: 14,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          1. Chantier
        </div>
        <select
          value={chantierId}
          onChange={e => setChantierId(e.target.value)}
          style={{ ...sel, width: '100%', maxWidth: 400, fontSize: 14 }}
        >
          {data.chantiers.map(c => (
            <option key={c.id} value={c.id}>{c.nom} — {c.client}</option>
          ))}
        </select>
        {chantier && (
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 6 }}>
            {chantier.adresse} · Phase : {chantier.phase} · Statut : {chantier.statut}
          </div>
        )}
      </div>

      {/* ── ÉTAPE 2 : Sélection des photos ── */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: m ? 14 : 18,
        boxShadow: '0 1px 3px rgba(15,23,42,0.06)', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            2. Photos ({photos.length}/{MAX_PHOTOS})
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {photos.length > 0 && (
              <button onClick={clearAll} style={{ ...btnS, fontSize: 11, padding: '5px 10px' }}>
                Tout effacer
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || photos.length >= MAX_PHOTOS}
              style={{
                ...btnP, fontSize: 12,
                opacity: (loading || photos.length >= MAX_PHOTOS) ? 0.5 : 1,
                cursor: (loading || photos.length >= MAX_PHOTOS) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {loading ? (
                <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #fff4', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />Chargement…</>
              ) : photos.length >= MAX_PHOTOS ? (
                `${MAX_PHOTOS} max atteint`
              ) : (
                '📸 Sélectionner des photos'
              )}
            </button>
          </div>
        </div>

        {photos.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed #E2E8F0', borderRadius: 10,
              padding: '40px 20px', textAlign: 'center', cursor: 'pointer',
              transition: 'border-color .15s, background .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.background = '#EFF6FF' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = 'transparent' }}
          >
            <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}>📸</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
              Sélectionne des photos de ton chantier
            </div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>
              Depuis la galerie, l'appareil photo, ou tes fichiers · Max {MAX_PHOTOS} photos
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {photos.map((photo, idx) => (
              <div key={photo.id} style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                background: '#F8FAFC', borderRadius: 10, padding: 10,
                border: '1px solid #E2E8F0',
              }}>
                {/* Miniature */}
                <img
                  src={photo.base64}
                  alt={photo.description || `Photo ${idx + 1}`}
                  style={{
                    width: m ? 80 : 120, height: m ? 60 : 80,
                    objectFit: 'cover', borderRadius: 6, flexShrink: 0,
                  }}
                />
                {/* Infos */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{
                      background: '#1E3A5F', color: '#fff', borderRadius: 999,
                      width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, flexShrink: 0,
                    }}>{idx + 1}</span>
                    <input
                      value={photo.description}
                      onChange={e => updateDesc(photo.id, e.target.value)}
                      placeholder="Légende de la photo…"
                      style={{
                        flex: 1, padding: '5px 8px', border: '1px solid #E2E8F0',
                        borderRadius: 6, fontSize: 12, fontFamily: 'inherit', outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => movePhoto(photo.id, -1)}
                      disabled={idx === 0}
                      title="Monter"
                      style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 8px', cursor: idx === 0 ? 'not-allowed' : 'pointer', fontSize: 11, opacity: idx === 0 ? 0.3 : 1, fontFamily: 'inherit' }}
                    >↑</button>
                    <button
                      onClick={() => movePhoto(photo.id, 1)}
                      disabled={idx === photos.length - 1}
                      title="Descendre"
                      style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 8px', cursor: idx === photos.length - 1 ? 'not-allowed' : 'pointer', fontSize: 11, opacity: idx === photos.length - 1 ? 0.3 : 1, fontFamily: 'inherit' }}
                    >↓</button>
                    <button
                      onClick={() => removePhoto(photo.id)}
                      title="Retirer"
                      style={{ background: '#fff', border: '1px solid #FECACA', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: '#DC2626', fontFamily: 'inherit', marginLeft: 'auto' }}
                    >✕ Retirer</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── ÉTAPE 3 : Générer le PDF ── */}
      {photos.length > 0 && (
        <div style={{
          background: '#fff', borderRadius: 12, padding: m ? 14 : 18,
          boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 10,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              3. Générer le reportage
            </div>
            <div style={{ fontSize: 12, color: '#334155', marginTop: 4 }}>
              <strong>{chantier?.nom}</strong> · {photos.length} photo{photos.length > 1 ? 's' : ''} · {fmtDate(new Date())}
            </div>
          </div>
          <button
            onClick={handleGeneratePdf}
            disabled={generatingPdf || !chantier}
            style={{
              ...btnP, fontSize: 14, padding: '12px 24px',
              background: '#DC2626',
              opacity: (generatingPdf || !chantier) ? 0.6 : 1,
              cursor: (generatingPdf || !chantier) ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {generatingPdf ? (
              <><span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #fff4', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />Génération…</>
            ) : '📄 Générer le reportage PDF'}
          </button>
        </div>
      )}
    </div>
  )
}
