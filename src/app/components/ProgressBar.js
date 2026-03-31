'use client'

/**
 * Composant ProgressBar réutilisable
 * Affiche une barre de progression avec couleur personnalisée
 */
export default function ProgressBar({
  value = 0,
  max = 100,
  color = '#3B82F6',
  height = 8,
}) {
  const percentage = Math.min(Math.round((value / max) * 100), 100);

  return (
    <div
      style={{
        background: '#F1F5F9',
        borderRadius: height,
        height,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <div
        style={{
          width: `${percentage}%`,
          height: '100%',
          background: color,
          borderRadius: height,
          transition: 'width .5s',
        }}
      />
    </div>
  );
}
