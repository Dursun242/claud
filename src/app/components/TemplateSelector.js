'use client'

/**
 * Composant TemplateSelector
 * Affiche une liste de templates et permet de sélectionner un template comme base
 * Utilisé pour créer rapidement des nouveaux éléments (OS, CR, etc) à partir de templates
 */
export default function TemplateSelector({
  templateType = 'os',
  templates = [],
  onSelectTemplate,
  loading = false,
}) {
  if (templates.length === 0) {
    return (
      <p style={{ color: '#6E6E73', fontSize: 12 }}>
        Aucun template. Créez-en un en cliquant sur 💾 sur un {templateType}.
      </p>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
      {templates.map((tpl) => (
        <button
          key={tpl.id}
          onClick={() => onSelectTemplate(tpl)}
          disabled={loading}
          style={{
            background: '#F2F2F7',
            border: '1px solid #E5E5EA',
            borderRadius: 8,
            padding: 12,
            cursor: loading ? 'not-allowed' : 'pointer',
            textAlign: 'left',
            transition: 'all .2s',
            opacity: loading ? 0.6 : 1,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1C1C1E' }}>
            {tpl.name}
          </div>
          <div style={{ fontSize: 11, color: '#6E6E73' }}>
            {tpl.description}
          </div>
        </button>
      ))}
    </div>
  )
}
