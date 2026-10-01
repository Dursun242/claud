'use client'
import { useEffect, useRef, useState } from 'react'
import { photoFromFile, signedUrls } from '../../lib/crPhotos'
import { useToast } from '../../contexts/ToastContext'

/**
 * Photos d'un point ou d'un lot : prise directe (appareil photo du
 * téléphone) ou import, légende, retrait. Les nouvelles photos restent sur
 * l'appareil ({ dataUrl }) jusqu'à l'enregistrement du CR.
 */
export default function CRPhotoStrip({ photos = [], onChange, label = 'Photo' }) {
  const { addToast } = useToast()
  const inputRef = useRef(null)
  const [urls, setUrls] = useState({})
  const [busy, setBusy] = useState(false)
  const paths = photos.filter(p => p.path && !urls[p.path]).map(p => p.path)
  const pathsKey = paths.join('|')

  useEffect(() => {
    if (!pathsKey) return
    let alive = true
    signedUrls(pathsKey.split('|')).then(u => { if (alive) setUrls(prev => ({ ...prev, ...u })) })
    return () => { alive = false }
  }, [pathsKey])

  const onFiles = async (files) => {
    if (!files?.length) return
    setBusy(true)
    try {
      const added = []
      for (const f of files) added.push(await photoFromFile(f))
      onChange([...photos, ...added])
    } catch (e) {
      addToast(e?.message || 'Photo illisible', 'error')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {photos.map((p, i) => {
        const src = p.dataUrl || urls[p.path]
        return (
          <figure key={p.path || i} style={{ margin: 0, width: 108 }}>
            <div style={{ position: 'relative', width: 108, height: 80, borderRadius: 8, overflow: 'hidden', background: '#E2E8F0' }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- dataUrl locale ou URL signée à durée courte */}
              {src && <img src={src} alt={p.legende || `Photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              {!p.path && <span title="Pas encore envoyée" style={{ position: 'absolute', left: 4, top: 4, fontSize: 9, fontWeight: 700, background: '#FEF3C7', color: '#92400E', borderRadius: 4, padding: '1px 4px' }}>local</span>}
              <button type="button" aria-label={`Retirer la photo ${i + 1}`}
                onClick={() => onChange(photos.filter((_, j) => j !== i))}
                style={{ position: 'absolute', right: 3, top: 3, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(15,23,42,.65)', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>✕</button>
            </div>
            <input aria-label={`Légende de la photo ${i + 1}`} value={p.legende || ''} placeholder="Légende"
              onChange={e => onChange(photos.map((x, j) => (j === i ? { ...x, legende: e.target.value } : x)))}
              style={{ width: '100%', marginTop: 3, fontSize: 11, padding: '3px 5px', border: '1px solid #E2E8F0', borderRadius: 5, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </figure>
        )
      })}
      <label style={{
        width: 80, height: 80, borderRadius: 8, border: '1.5px dashed #94A3B8', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', cursor: busy ? 'wait' : 'pointer', color: '#475569', fontSize: 11, fontWeight: 700, gap: 2,
      }}>
        <span aria-hidden="true" style={{ fontSize: 20 }}>📷</span>
        {busy ? '…' : `+ ${label}`}
        <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple hidden
          onChange={e => onFiles([...(e.target.files || [])])} />
      </label>
    </div>
  )
}
