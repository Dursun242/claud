'use client'
import { useState, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

function typeIcon(type) {
  switch (type) {
    case 'PDF': return '📄'
    case 'Image': return '🖼️'
    case 'Tableau': return '📊'
    case 'Document': return '📝'
    case 'Archive': return '🗜️'
    default: return '📎'
  }
}

export default function DocumentSearch({ chantierId = null }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef(null)

  const handleSearch = useCallback(async (query) => {
    setSearchQuery(query)

    if (!query.trim()) {
      setResults([])
      setShowResults(false)
      return
    }

    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('q', query)
      if (chantierId) params.append('chantierId', chantierId)

      const response = await fetch(`/api/search-attachments?${params}`)
      const data = await response.json()

      setResults(data.results || [])
      setShowResults(true)
    } catch (err) {
      console.error('Erreur recherche:', err)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [chantierId])

  const handleDocumentClick = async (att) => {
    try {
      // download: att.file_name → Supabase renvoie le PDF avec un
      // Content-Disposition qui force le vrai nom de fichier (au lieu
      // du timestamp technique du storage).
      const { data } = await supabase.storage
        .from('attachments')
        .createSignedUrl(att.file_path, 3600, { download: att.file_name })

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank')
      }
    } catch (err) {
      console.error('Erreur ouverture:', err)
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%' }} ref={searchRef}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          placeholder="🔍 Chercher dans les documents..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid #E2E8F0',
            borderRadius: 8,
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none',
            transition: 'border-color .2s',
          }}
          onFocus={() => searchQuery && setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)}
        />
      </div>

      {showResults && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 8,
          background: '#fff',
          border: '1px solid #E2E8F0',
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(15,23,42,0.1)',
          zIndex: 100,
          maxHeight: 400,
          overflowY: 'auto',
        }}>
          {loading ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>
              Recherche en cours...
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>
              Aucun document trouvé
            </div>
          ) : (
            <div>
              {results.map((doc, idx) => (
                <button
                  key={doc.id}
                  onClick={() => handleDocumentClick(doc)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderTop: idx > 0 ? '1px solid #F1F5F9' : 'none',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: 18, minWidth: 24 }}>{typeIcon(doc.type)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#0F172A',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {doc.file_name}
                    </div>
                    <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
                      {doc.chantier_nom} • {formatSize(doc.file_size)}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: '#CBD5E1', whiteSpace: 'nowrap' }}>
                    {doc.type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
