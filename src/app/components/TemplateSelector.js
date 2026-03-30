'use client'
import { useState, useEffect } from 'react'

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
      <p style={{ color: '#94A3B8', fontSize: 12 }}>
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
            background: '#F0F4F8',
            border: '1px solid #E2E8F0',
            borderRadius: 8,
            padding: 12,
            cursor: loading ? 'not-allowed' : 'pointer',
            textAlign: 'left',
            transition: 'all .2s',
            opacity: loading ? 0.6 : 1,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>
            {tpl.name}
          </div>
          <div style={{ fontSize: 11, color: '#64748B' }}>
            {tpl.description}
          </div>
        </button>
      ))}
    </div>
  )
}
