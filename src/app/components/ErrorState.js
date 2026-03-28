'use client'
import { colors, spacing, typography } from '../design-system'
import Button from './Button'
import Card from './Card'

export default function ErrorState({
  title = 'Une erreur est survenue',
  message = 'Veuillez réessayer',
  onRetry = null,
  fullHeight = false,
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: fullHeight ? '100vh' : '300px',
        padding: spacing.xl,
      }}
    >
      <Card style={{ maxWidth: '400px', textAlign: 'center' }}>
        <div
          style={{
            fontSize: '48px',
            marginBottom: spacing.lg,
          }}
        >
          ⚠️
        </div>
        <h3 style={{ ...typography.h3, color: colors.danger, marginBottom: spacing.md }}>
          {title}
        </h3>
        <p style={{ ...typography.body.base, color: colors.gray[400], marginBottom: spacing.lg }}>
          {message}
        </p>
        {onRetry && (
          <Button onClick={onRetry} size="lg">
            Réessayer
          </Button>
        )}
      </Card>
    </div>
  )
}
