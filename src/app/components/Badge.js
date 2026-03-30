'use client'

/**
 * Composant Badge réutilisable
 * Affiche un badge avec texte et couleur personnalisée
 */
export default function Badge({ text, color = '#3B82F6' }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 16,
        fontSize: 10,
        fontWeight: 700,
        background: color + '18',
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}
