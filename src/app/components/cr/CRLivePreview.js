'use client'
import { useEffect, useRef, useState } from 'react'
import { loadCrImages } from '../../lib/crPhotos'
import { ghostBtn } from './crStyles'

// Délai après la dernière modification avant de refaire le PDF
const DELAI_MS = 1200
const revoke = (u) => { try { URL.revokeObjectURL?.(u) } catch { /* déjà libéré */ } }

/**
 * Aperçu du PDF du compte rendu, mis à jour pendant la saisie (dictée,
 * corrections). `getPreview` change à chaque modification du CR
 * (useCrEditor().preview) : le PDF est refait peu après la dernière.
 * Les photos déjà enregistrées ne sont téléchargées qu'une fois.
 */
export default function CRLivePreview({ getPreview, chantier, onOpenFull, onClose, style }) {
  const [url, setUrl] = useState(null)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState('')
  const images = useRef({ key: '', data: {} })

  useEffect(() => {
    let cancelled = false
    setPending(true)
    const timer = setTimeout(async () => {
      try {
        const p = getPreview?.()
        if (!p) return
        const paths = JSON.stringify([
          ...(p.cr.sections || []).flatMap(s => s.photos || []),
          ...(p.cr.taches_suivi || []).flatMap(r => r.photos || []),
        ].map(ph => ph?.path).filter(x => x && !x.startsWith('local:')).sort())
        if (images.current.key !== paths) images.current = { key: paths, data: await loadCrImages(p.cr) }
        const { generateCRPdf } = await import('../../generators')
        const out = await generateCRPdf(p.cr, chantier, { images: { ...images.current.data, ...p.images }, returnBlobUrl: true })
        if (cancelled) { revoke(out.url); return }
        setUrl(old => {
          if (old) setTimeout(() => revoke(old), 10_000)
          return out.url
        })
        setError('')
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e))
      } finally {
        if (!cancelled) setPending(false)
      }
    }, DELAI_MS)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [getPreview, chantier])

  // Libère le dernier fichier à la fermeture de l'aperçu
  const last = useRef(null)
  last.current = url
  useEffect(() => () => { if (last.current) revoke(last.current) }, [])

  return (
    <aside aria-label="Aperçu du PDF" style={{
      display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid var(--separator)',
      borderRadius: 12, overflow: 'hidden', ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--separator)' }}>
        <strong style={{ fontSize: 13, color: 'var(--label)' }}>Aperçu du PDF</strong>
        <span role="status" style={{ fontSize: 11, color: error ? 'var(--red-text)' : 'var(--label-secondary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {error ? `Aperçu impossible : ${error}` : pending ? 'Mise à jour…' : 'À jour'}
        </span>
        {onOpenFull && <button type="button" onClick={onOpenFull} style={{ ...ghostBtn(), padding: '5px 10px', fontSize: 12 }}>Ouvrir en grand</button>}
        {onClose && <button type="button" onClick={onClose} aria-label="Fermer l'aperçu" style={{ ...ghostBtn(), padding: '5px 10px', fontSize: 12 }}>✕</button>}
      </div>
      {url ? (
        <iframe title="Aperçu du compte rendu" src={`${url}#view=FitH`} style={{ flex: 1, width: '100%', border: 'none', background: '#525659' }} />
      ) : (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--label-secondary)', fontSize: 13, padding: 20 }}>
          {error ? 'Le PDF n’a pas pu être préparé.' : 'Préparation du PDF…'}
        </div>
      )}
    </aside>
  )
}
