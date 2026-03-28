'use client'
import { colors, spacing, radius } from '../design-system'

export default function Badge({
  children,
  variant = 'default', // default | success | warning | danger | info | primary
  size = 'sm', // sm | md
  style = {},
}) {
  const variants = {
    default: { background: colors.gray[700], color: colors.gray[200] },
    success: { background: `${colors.success}20`, color: colors.success },
    warning: { background: `${colors.warning}20`, color: colors.warning },
    danger: { background: `${colors.danger}20`, color: colors.danger },
    info: { background: `${colors.info}20`, color: colors.info },
    primary: { background: `${colors.primary[600]}20`, color: colors.primary[400] },
  }

  const sizes = {
    sm: { padding: `${spacing.xs} ${spacing.sm}`, fontSize: '11px' },
    md: { padding: `${spacing.sm} ${spacing.md}`, fontSize: '12px' },
  }

  const baseStyle = {
    ...variants[variant],
    ...sizes[size],
    borderRadius: radius.full,
    fontWeight: 600,
    display: 'inline-block',
    whiteSpace: 'nowrap',
    ...style,
  }

  return <span style={baseStyle}>{children}</span>
}
