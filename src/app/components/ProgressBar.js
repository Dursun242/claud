'use client'

/**
 * Composant ProgressBar réutilisable
 * Affiche une barre de progression avec couleur personnalisée
 */
export default function ProgressBar({
  value = 0,
  max = 100,
  color = '#007AFF',
  height = 8,
}) {
  const percentage = Math.min(Math.round((value / max) * 100), 100);

  return (
    <div
      style={{
        background: '#F2F2F7',
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
