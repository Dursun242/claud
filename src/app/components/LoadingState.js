'use client'
import { colors, spacing, typography } from '../design-system'
import Spinner from './Spinner'

export default function LoadingState({
  message = 'Chargement...',
  size = 'md',
  fullHeight = false,
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.lg,
        padding: spacing.xl,
        minHeight: fullHeight ? '100vh' : 'auto',
        color: colors.gray[400],
      }}
    >
      <Spinner size={size} color="primary" />
      <p style={{ ...typography.body.base, color: colors.gray[400], margin: 0 }}>
        {message}
      </p>
    </div>
  )
}
