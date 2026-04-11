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

  const confirmDelete = () => {
    if (window.confirm(`Supprimer « ${att.file_name} » ?`)) {
      onDelete(att.id, att.file_path)
    }
  }

  return (
    <div style={{ position: 'relative', background: '#F8FAFC', borderRadius: 8, padding: 6, textAlign: 'center', border: '1px solid #E2E8F0' }}>
      {isImg ? (
        url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" title={`Ouvrir ${att.file_name}`}>
            <img src={url} style={{ width: '100%', height: 64, objectFit: 'cover', borderRadius: 5, display: 'block' }} alt={att.file_name} />
          </a>
        ) : (
          <div style={{ width: '100%', height: 64, background: '#E2E8F0', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#94A3B8' }}>
            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
          </div>
        )
      ) : (
        <a href={url || '#'} target="_blank" rel="noopener noreferrer" title={`Télécharger ${att.file_name}`} style={{ textDecoration: 'none', display: 'block', padding: '16px 0' }}>
          <div style={{ fontSize: 28 }}>{icon}</div>
        </a>
      )}
      <button
        onClick={confirmDelete}
        aria-label={`Supprimer ${att.file_name}`}
        title="Supprimer"
        style={{
          position: 'absolute', top: -5, right: -5,
          background: '#fff', color: '#DC2626',
          border: '1px solid #FECACA',
          borderRadius: '50%', width: 20, height: 20,
          cursor: 'pointer', fontSize: 11,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(15,23,42,0.15)',
          padding: 0, lineHeight: 1, fontFamily: 'inherit',
        }}
      >✕</button>
      <div title={att.file_name} style={{ fontSize: 9, color: '#64748B', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {att.file_name}
      </div>
    </div>
  )
}

/**
 * Composant AttachmentsSection
 * Gère l'upload, l'affichage et la suppression des pièces jointes.
 * Supporte maintenant le drag & drop des fichiers.
 */
export default function AttachmentsSection({ attachments = [], onUpload, onDelete, loading = false }) {
  const fileInputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return
    // Upload séquentiel pour garder un ordre déterministe et voir les erreurs
    for (const file of files) {
      try { await onUpload(file) }
      catch (err) { console.error('Upload failed:', err) }
    }
  }

  const handleFileSelect = async (e) => {
    await handleFiles(e.target.files)
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #E2E8F0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
          📎 Pièces jointes <span style={{ color: '#94A3B8', fontWeight: 500 }}>({attachments.length})</span>
        </span>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          style={{
            background: '#EFF6FF',
            color: '#1D4ED8',
            border: '1px solid #BFDBFE',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 10,
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.6 : 1,
            fontFamily: 'inherit',
          }}
        >
          {loading ? '⏳ Upload…' : '+ Ajouter'}
        </button>
        <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} style={{ display: 'none' }} />
      </div>

      {attachments.length === 0 ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? '#3B82F6' : '#E2E8F0'}`,
            background: dragOver ? '#EFF6FF' : '#F8FAFC',
            borderRadius: 10,
            padding: '24px 16px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'background .15s, border-color .15s',
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 4, opacity: 0.5 }}>📎</div>
          <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>
            {dragOver ? 'Déposez le fichier ici' : 'Cliquez ou glissez un fichier ici'}
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(88px,1fr))',
            gap: 8,
            padding: dragOver ? 6 : 0,
            border: dragOver ? '2px dashed #3B82F6' : '2px dashed transparent',
            background: dragOver ? '#EFF6FF' : 'transparent',
            borderRadius: 8,
            transition: 'background .15s, border-color .15s',
          }}
        >
          {attachments.map((att) => (
            <AttachmentThumb key={att.id} att={att} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
