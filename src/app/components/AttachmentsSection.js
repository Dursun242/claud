'use client'
import { useRef } from 'react'

/**
 * Composant AttachmentsSection
 * Gère l'upload, l'affichage et la suppression des pièces jointes
 * (utilisé dans CR, OS, Chantiers, etc)
 */
export default function AttachmentsSection({
  attachments = [],
  onUpload,
  onDelete,
  loading = false,
}) {
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

  const isImage = (fileName) => /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)

  const getFileIcon = (fileName) => {
    if (/\.pdf$/i.test(fileName)) return '📄'
    if (/\.(xls|xlsx|csv)$/i.test(fileName)) return '📊'
    if (/\.(doc|docx)$/i.test(fileName)) return '📝'
    return '📎'
  }

  const getFileUrl = (filePath) => {
    // This should be called from parent and passed down as prop
    // For now, return a constructed URL (adjust based on your Supabase setup)
    return `https://YOUR_SUPABASE_URL/storage/v1/object/public/attachments/${filePath}`
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
            background: '#3B82F6',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '4px 10px',
            fontSize: 10,
            fontWeight: 700,
            cursor: 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? '⏳' : '+ Ajouter'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(80px,1fr))', gap: 8 }}>
        {attachments.map((att) => (
          <div
            key={att.id}
            style={{
              position: 'relative',
              background: '#F8FAFC',
              borderRadius: 6,
              padding: 6,
              textAlign: 'center',
            }}
          >
            {isImage(att.file_name) ? (
              <img
                src={getFileUrl(att.file_path)}
                style={{
                  width: '100%',
                  height: 60,
                  objectFit: 'cover',
                  borderRadius: 4,
                }}
                alt={att.file_name}
              />
            ) : (
              <div style={{ fontSize: 24, textAlign: 'center' }}>
                {getFileIcon(att.file_name)}
              </div>
            )}
            <button
              onClick={() => onDelete(att.id, att.file_path)}
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                background: '#EF4444',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: 20,
                height: 20,
                cursor: 'pointer',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>
            <div
              style={{
                fontSize: 8,
                color: '#94A3B8',
                marginTop: 4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {att.file_name}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
