'use client'

// ═══════════════════════════════════════════════════════════════
// ContactInfoLink + CopyIconBtn
// ═══════════════════════════════════════════════════════════════
//
// Deux petits helpers présentationnels extraits de ContactsV :
//
//   CopyIconBtn
//     Bouton icône 14×14 pour copier une valeur dans le presse-papier.
//
//   ContactInfoLink
//     Lien cliquable (tel: / mailto:) avec ce bouton "copier" à droite.
//     Le clic sur le lien ouvre l'app native ; le clic sur l'icône copie.

export function CopyIconBtn({ onClick }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClick?.() }}
      aria-label="Copier"
      title="Copier dans le presse-papier"
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        width: 14,
        height: 14,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94A3B8',
        fontFamily: 'inherit',
        opacity: 0.7,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = 1
        e.currentTarget.style.color = '#3B82F6'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = 0.7
        e.currentTarget.style.color = '#94A3B8'
      }}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  )
}

export default function ContactInfoLink({ href, onCopy, onTap, label, maxWidth }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <a
        href={href}
        onClick={(e) => { e.stopPropagation(); onTap?.() }}
        style={{
          color: '#1D4ED8',
          textDecoration: 'none',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: maxWidth || undefined,
        }}
      >
        {label}
      </a>
      <CopyIconBtn onClick={onCopy} />
    </span>
  )
}
