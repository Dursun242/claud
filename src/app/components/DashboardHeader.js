'use client'
import { colors, spacing, typography } from '../design-system'
import Button from './Button'

export default function DashboardHeader({ title, subtitle, user, onLogout }) {
  return (
    <div style={{
      background: colors.gray[900],
      borderBottom: `1px solid ${colors.gray[700]}`,
      padding: `${spacing.lg} ${spacing.xl}`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.lg,
      flexWrap: 'wrap',
    }}>
      <div>
        <h1 style={{
          ...typography.h2,
          color: colors.gray[200],
          margin: '0 0 4px 0',
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            ...typography.body.sm,
            color: colors.gray[400],
            margin: 0,
          }}>
            {subtitle}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
        {user && (
          <div style={{
            textAlign: 'right',
          }}>
            <p style={{
              ...typography.body.sm,
              color: colors.gray[300],
              margin: 0,
            }}>
              {user.email}
            </p>
          </div>
        )}
        <Button variant="danger" size="sm" onClick={onLogout}>
          🚪 Déconnexion
        </Button>
      </div>
    </div>
  )
}
