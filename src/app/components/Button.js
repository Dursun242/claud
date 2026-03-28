'use client'
import { colors, spacing, radius, transitions } from '../design-system'

export default function Button({
  children,
  variant = 'primary', // primary | secondary | danger | ghost
  size = 'md', // sm | md | lg
  disabled = false,
  onClick = null,
  style = {},
  ...props
}) {
  const sizeStyles = {
    sm: { padding: `${spacing.sm} ${spacing.md}`, fontSize: '12px' },
    md: { padding: `${spacing.md} ${spacing.lg}`, fontSize: '14px' },
    lg: { padding: `${spacing.lg} ${spacing.xl}`, fontSize: '16px' },
  }

  const variantStyles = {
    primary: {
      background: colors.primary[600],
      color: colors.white,
      border: 'none',
      '&:hover': { background: colors.primary[700] },
      '&:active': { background: colors.primary[800] },
    },
    secondary: {
      background: colors.gray[800],
      color: colors.gray[200],
      border: `1px solid ${colors.gray[700]}`,
      '&:hover': { background: colors.gray[700], borderColor: colors.gray[600] },
    },
    danger: {
      background: colors.danger,
      color: colors.white,
      border: 'none',
      '&:hover': { background: '#DC2626' },
    },
    ghost: {
      background: 'transparent',
      color: colors.gray[200],
      border: 'none',
      '&:hover': { background: colors.gray[800] },
    },
  }

  const baseStyle = {
    ...sizeStyles[size],
    ...variantStyles[variant],
    borderRadius: radius.md,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: `all ${transitions.base}`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    opacity: disabled ? 0.5 : 1,
    ...style,
  }

  return (
    <button
      style={baseStyle}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  )
}
