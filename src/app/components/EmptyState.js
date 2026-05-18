'use client'

/**
 * EmptyState — état vide engageant et cohérent.
 *
 * Avant : 12+ implémentations différentes pour dire "rien à afficher",
 * allant d'un `<p style={{color:'#94A3B8'}}>Aucun X</p>` discret à des
 * blocs avec icône 36px + sous-titre. Visuellement disparate.
 *
 * Cette version unifie :
 * - icône emoji ou ReactNode (40 px en variante normale, 24 px en compact)
 * - titre + description optionnelle
 * - bouton d'action optionnel (label + onClick)
 * - 2 variantes : `compact` (inline, dense) et défaut (carte centrée)
 *
 * Accessibilité : role="status" pour annoncer aux lecteurs d'écran qu'on
 * est dans un état particulier (vide) plutôt que dans un chargement.
 *
 * Usage :
 *   <EmptyState icon="📎" title="Aucun document" />
 *   <EmptyState icon="📅" title="Aucun OS planifié"
 *               description="Renseigne une date pour afficher le Gantt." />
 *   <EmptyState compact icon="💬" title="Aucun commentaire pour l'instant" />
 *   <EmptyState icon="📨" title="Aucun contact" action={{
 *     label: "+ Ajouter un contact", onClick: () => setOpen(true)
 *   }} />
 */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}) {
  if (compact) {
    return (
      <div
        role="status"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 16px',
          color: '#64748B',
          fontSize: 12,
          background: '#F8FAFC',
          border: '1px dashed #E2E8F0',
          borderRadius: 10,
        }}
      >
        {icon && <span aria-hidden="true" style={{ fontSize: 18, opacity: 0.7, flexShrink: 0 }}>{icon}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: '#334155' }}>{title}</div>
          {description && (
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2, lineHeight: 1.4 }}>
              {description}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      role="status"
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: '40px 24px',
        textAlign: 'center',
        boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
      }}
    >
      {icon && <div aria-hidden="true" style={{ fontSize: 40, marginBottom: 10, opacity: 0.5 }}>{icon}</div>}
      <div style={{
        fontSize: 14, fontWeight: 700, color: '#334155',
        marginBottom: description ? 6 : 0,
      }}>
        {title}
      </div>
      {description && (
        <div style={{
          fontSize: 12, color: '#64748B', maxWidth: 360, margin: '0 auto',
          lineHeight: 1.5,
        }}>
          {description}
        </div>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="u-press u-press--row"
          style={{
            marginTop: 16,
            padding: '10px 18px',
            minHeight: 40,
            background: '#1E3A5F',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
