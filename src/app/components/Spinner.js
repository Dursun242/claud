'use client'
import { colors, spacing } from '../design-system'

export default function Spinner({ size = 'md', color = 'primary' }) {
  const sizes = {
    sm: { width: '20px', height: '20px' },
    md: { width: '32px', height: '32px' },
    lg: { width: '48px', height: '48px' },
  }

  const colorMap = {
    primary: colors.primary[600],
    white: colors.white,
    gray: colors.gray[400],
  }

  const styles = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `

  return (
    <>
      <style>{styles}</style>
      <div
        style={{
          ...sizes[size],
          border: `3px solid ${colorMap[color]}20`,
          borderTop: `3px solid ${colorMap[color]}`,
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          display: 'inline-block',
        }}
      />
    </>
  )
}
