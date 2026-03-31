'use client'

/**
 * Composant PageLoadingState
 * Skeleton screen pour les pages lors du chargement
 * Donne du feedback à l'utilisateur pendant que les données chargent
 */
export default function PageLoadingState({ pageType = 'list' }) {
  if (pageType === 'list') {
    return (
      <div style={{ padding: 20 }}>
        {/* Header skeleton */}
        <div
          style={{
            height: 40,
            background: '#f0f0f0',
            borderRadius: 8,
            marginBottom: 20,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />

        {/* List items skeleton */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              height: 60,
              background: '#f0f0f0',
              borderRadius: 8,
              marginBottom: 12,
              animation: 'pulse 1.5s ease-in-out infinite',
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>
    )
  }

  if (pageType === 'detail') {
    return (
      <div style={{ padding: 20 }}>
        {/* Header skeleton */}
        <div
          style={{
            height: 200,
            background: '#f0f0f0',
            borderRadius: 8,
            marginBottom: 20,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />

        {/* Sections skeleton */}
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              marginBottom: 20,
            }}
          >
            <div
              style={{
                height: 30,
                background: '#f0f0f0',
                borderRadius: 8,
                marginBottom: 10,
                width: '200px',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
            <div
              style={{
                height: 100,
                background: '#f0f0f0',
                borderRadius: 8,
                animation: 'pulse 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.1}s`,
              }}
            />
          </div>
        ))}
      </div>
    )
  }

  if (pageType === 'cards') {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              style={{
                height: 250,
                background: '#f0f0f0',
                borderRadius: 8,
                animation: 'pulse 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  // Default
  return (
    <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>
      ⏳ Chargement...
    </div>
  )
}
