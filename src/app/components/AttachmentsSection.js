'use client'
import { useRef, useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useConfirm } from '../contexts/ConfirmContext'
import { SB } from '../dashboards/shared'

// Formatage humain d'une taille en octets (123 Ko, 4.2 Mo…)
function formatSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

// Couleur + icône selon le type de fichier
function kindFor(fileName) {
  const n = (fileName || '').toLowerCase()
  if (/\.(jpg|jpeg|png|gif|webp|heic|heif)$/.test(n)) return { icon: '🖼️', color: '#10B981', bg: '#ECFDF5', label: 'IMG' }
  if (/\.pdf$/.test(n))                                return { icon: '📄', color: '#DC2626', bg: '#FEF2F2', label: 'PDF' }
  if (/\.(xls|xlsx|csv)$/.test(n))                     return { icon: '📊', color: '#047857', bg: '#ECFDF5', label: 'XLS' }
  if (/\.(doc|docx)$/.test(n))                         return { icon: '📝', color: '#1D4ED8', bg: '#EFF6FF', label: 'DOC' }
  if (/\.(zip|rar|7z)$/.test(n))                       return { icon: '🗜️', color: '#B45309', bg: '#FFFBEB', label: 'ZIP' }
  return { icon: '📎', color: '#64748B', bg: '#F1F5F9', label: 'FILE' }
}

// Ligne compacte : icône/miniature, nom, taille, bouton supprimer
function AttachmentRow({ att, onDelete }) {
  const confirm = useConfirm()
  const [url, setUrl] = useState('')
  const isImg = /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(att.file_name)
  const kind = kindFor(att.file_name)

  useEffect(() => {
    let cancelled = false
    // Option `download: att.file_name` → Supabase ajoute
    // `Content-Disposition: attachment; filename="..."` à la réponse, donc
    // le navigateur enregistre le fichier avec son nom métier
    // (« Reportage-Photo_Villa-Dupont_2026-04-21.pdf ») au lieu du nom
    // technique du storage (« 1776776071329.pdf »).
    supabase.storage.from('attachments')
      .createSignedUrl(att.file_path, 3600, { download: att.file_name })
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setUrl(data.signedUrl)
      })
    return () => { cancelled = true }
  }, [att.file_path, att.file_name])

  const confirmDelete = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    const ok = await confirm({
      title: `Supprimer « ${att.file_name} » ?`,
      message: 'Ce fichier sera définitivement supprimé du stockage.',
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (ok) onDelete(att.id, att.file_path)
  }

  // Log la consultation du fichier (une fois par clic, pas de double fire)
  const logOpen = () => {
    try {
      SB.log('view_attachment', 'attachment', att.id, att.file_name, {
        file_name: att.file_name,
        file_size: att.file_size || null,
        kind: kind.label,
      })
    } catch (_) { /* silencieux — l'ouverture du fichier ne doit pas être bloquée */ }
  }

  return (
    <a
      href={url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      title={`Ouvrir ${att.file_name}`}
      onClick={logOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px',
        background: '#fff',
        borderRadius: 8,
        textDecoration: 'none',
        color: 'inherit',
        border: '1px solid #E2E8F0',
        transition: 'background .12s, border-color .12s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#CBD5E1' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#E2E8F0' }}
    >
      {/* Icône / miniature — `url` est une signed URL Supabase avec TTL court :
          next/image la cacherait par URL, donc après expiration l'image
          resterait "bloquée" sur l'ancienne URL cassée. On garde <img> natif. */}
      {isImg && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: '#F1F5F9' }}
        />
      ) : (
        <div style={{
          width: 36, height: 36, minWidth: 36, flexShrink: 0,
          borderRadius: 6, background: kind.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, lineHeight: 1,
        }}>{kind.icon}</div>
      )}

      {/* Nom + taille */}
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: '#0F172A',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{att.file_name}</div>
        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: kind.color, fontWeight: 700, letterSpacing: '0.04em' }}>{kind.label}</span>
          {att.file_size ? <span>· {formatSize(att.file_size)}</span> : null}
        </div>
      </div>

      {/* Bouton supprimer — discret, pas en négatif rouge */}
      <button
        type="button"
        onClick={confirmDelete}
        aria-label={`Supprimer ${att.file_name}`}
        title="Supprimer"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#94A3B8',
          cursor: 'pointer',
          padding: 6,
          borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, lineHeight: 1,
          flexShrink: 0,
          fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = '#DC2626' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8' }}
      >✕</button>
    </a>
  )
}

/**
 * Composant AttachmentsSection
 * Gère l'upload, l'affichage et la suppression des pièces jointes.
 * Supporte le drag & drop des fichiers.
 */
export default function AttachmentsSection({ attachments = [], onUpload, onDelete, loading = false }) {
  const fileInputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return
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
            display: 'flex', flexDirection: 'column', gap: 6,
            padding: dragOver ? 6 : 0,
            border: dragOver ? '2px dashed #3B82F6' : '2px dashed transparent',
            background: dragOver ? '#EFF6FF' : 'transparent',
            borderRadius: 8,
            transition: 'background .15s, border-color .15s',
          }}
        >
          {attachments.map((att) => (
            <AttachmentRow key={att.id} att={att} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
