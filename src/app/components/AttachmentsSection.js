'use client'
import { useRef, useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

// Miniature avec URL signée (bucket privé — valide 1h)
function AttachmentThumb({ att, onDelete }) {
  const [url, setUrl] = useState('')
  const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(att.file_name)

  useEffect(() => {
    let cancelled = false
    supabase.storage.from('attachments').createSignedUrl(att.file_path, 3600)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setUrl(data.signedUrl)
      })
    return () => { cancelled = true }
  }, [att.file_path])

  const icon = /\.pdf$/i.test(att.file_name) ? '📄'
    : /\.(xls|xlsx|csv)$/i.test(att.file_name) ? '📊'
    : /\.(doc|docx)$/i.test(att.file_name) ? '📝'
    : '📎'

  return (
    <div style={{ position: 'relative', background: '#F8FAFC', borderRadius: 6, padding: 6, textAlign: 'center' }}>
      {isImg ? (
        url
          ? <img src={url} style={{ width: '100%', height: 60, objectFit: 'cover', borderRadius: 4 }} alt={att.file_name} />
          : <div style={{ width: '100%', height: 60, background: '#E2E8F0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⏳</div>
      ) : (
        <a href={url || '#'} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: 24 }}>{icon}</div>
        </a>
      )}
      <button
        onClick={() => onDelete(att.id, att.file_path)}
        style={{
          position: 'absolute', top: -4, right: -4,
          background: '#EF4444', color: '#fff', border: 'none',
          borderRadius: '50%', width: 20, height: 20,
          cursor: 'pointer', fontSize: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >✕</button>
      <div style={{ fontSize: 8, color: '#94A3B8', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {att.file_name}
      </div>
    </div>
  )
}

/**
 * Composant AttachmentsSection
 * Gère l'upload, l'affichage et la suppression des pièces jointes
 */
export default function AttachmentsSection({ attachments = [], onUpload, onDelete, loading = false }) {
  const fileInputRef = useRef(null)

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        await onUpload(file)
        e.target.value = ''
      } catch (err) {
        console.error('Upload failed:', err)
      }
    }
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #E2E8F0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#64748B' }}>
          📎 Attachments ({attachments.length})
        </span>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          style={{
            background: '#3B82F6', color: '#fff', border: 'none',
            borderRadius: 4, padding: '4px 10px', fontSize: 10, fontWeight: 700,
            cursor: 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? '⏳' : '+ Ajouter'}
        </button>
        <input ref={fileInputRef} type="file" onChange={handleFileSelect} style={{ display: 'none' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(80px,1fr))', gap: 8 }}>
        {attachments.map((att) => (
          <AttachmentThumb key={att.id} att={att} onDelete={onDelete} />
        ))}
      </div>
    </div>
  )
}
