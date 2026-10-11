'use client'

import { toneText, toneBg } from '../lib/tone'

/**
 * Composant Badge réutilisable
 * Statut en texte de sa couleur (teinte foncée, lisible) sur un fond très
 * dilué de la même couleur — jamais en aplat plein (DESIGN.md).
 */
export default function Badge({ text, color = '#007AFF' }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.5,
        background: toneBg(color),
        color: toneText(color),
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}
