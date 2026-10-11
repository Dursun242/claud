'use client'

/**
 * EmptyState — état vide engageant et cohérent.
 *
 * Avant : 12+ implémentations différentes pour dire "rien à afficher",
 * allant d'un `<p style={{color:'#6E6E73'}}>Aucun X</p>` discret à des
 * blocs avec icône 36px + sous-titre. Visuellement disparate.
 *
 * Cette version unifie :
 * - icône emoji ou ReactNode (40 px en variante normale, 24 px en compact)
 * - titre + description optionnelle
 * - bouton d'action optionnel (label + onClick)
 * - 2 variantes : `compact` (inline, dense) et défaut (carte centrée)
 *
 * Les icônes en emoji (chaîne de caractères) ne sont plus affichées : leur
 * rendu change d'un téléphone à l'autre (DESIGN.md). Passer un ReactNode
 * (ex. <Icon d={I.reports}/>) pour garder une icône dessinée.
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
  icon: iconProp,
  title,
  description,
  action,
  compact = false,
}) {
  const icon = typeof iconProp === 'string' ? null : iconProp
  if (compact) {
    return (
      <div
        role="status"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 16px',
          color: '#6E6E73',
          fontSize: 13,
          background: '#F5F5F7',
          border: '1px dashed #E5E5EA',
          borderRadius: 10,
        }}
      >
        {icon && <span aria-hidden="true" style={{ display: 'inline-flex', color: '#6E6E73', flexShrink: 0 }}>{icon}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: '#3A3A3C' }}>{title}</div>
          {description && (
            <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 2, lineHeight: 1.5 }}>
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
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      {icon && <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', color: '#8E8E93', marginBottom: 10 }}>{icon}</div>}
      <div style={{
        fontSize: 14, fontWeight: 700, color: '#3A3A3C',
        marginBottom: description ? 6 : 0,
      }}>
        {title}
      </div>
      {description && (
        <div style={{
          fontSize: 13, color: '#6E6E73', maxWidth: 360, margin: '0 auto',
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
            background: '#0071E3',
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
