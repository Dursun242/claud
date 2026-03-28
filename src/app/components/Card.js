'use client'
import { colors, spacing, radius, shadows } from '../design-system'

export default function Card({ children, hoverable = false, onClick = null, style = {} }) {
  const baseStyle = {
    background: colors.gray[800],
    border: `1px solid ${colors.gray[700]}`,
    borderRadius: radius.xl,
    padding: spacing.lg,
    boxShadow: shadows.sm,
    ...style,
  }

  const hoverStyle = hoverable
    ? {
        cursor: 'pointer',
        transition: `all 200ms ease-in-out`,
        '&:hover': {
          borderColor: colors.gray[600],
          boxShadow: shadows.md,
        },
      }
    : {}

  return (
    <div
      style={baseStyle}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (hoverable) {
          e.currentTarget.style.borderColor = colors.gray[600]
          e.currentTarget.style.boxShadow = shadows.md
        }
      }}
      onMouseLeave={(e) => {
        if (hoverable) {
          e.currentTarget.style.borderColor = colors.gray[700]
          e.currentTarget.style.boxShadow = shadows.sm
        }
      }}
    >
      {children}
    </div>
  )
}
