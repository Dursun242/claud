'use client'
import { colors, spacing, radius, transitions } from '../design-system'

export default function Input({
  type = 'text',
  placeholder = '',
  value = '',
  onChange = null,
  disabled = false,
  size = 'md', // sm | md | lg
  label = null,
  error = null,
  style = {},
  ...props
}) {
  const sizeStyles = {
    sm: { padding: `${spacing.xs} ${spacing.sm}`, fontSize: '12px' },
    md: { padding: `${spacing.md} ${spacing.lg}`, fontSize: '14px' },
    lg: { padding: `${spacing.lg} ${spacing.xl}`, fontSize: '16px' },
  }

  const baseStyle = {
    ...sizeStyles[size],
    background: colors.gray[900],
    border: `1px solid ${error ? colors.danger : colors.gray[700]}`,
    borderRadius: radius.md,
    color: colors.gray[200],
    transition: `all ${transitions.base}`,
    width: '100%',
    boxSizing: 'border-box',
    '&:focus': {
      outline: 'none',
      borderColor: error ? colors.danger : colors.primary[600],
      boxShadow: `0 0 0 3px ${error ? colors.danger : colors.primary[600]}20`,
    },
    '&:disabled': {
      background: colors.gray[800],
      color: colors.gray[500],
      cursor: 'not-allowed',
    },
    ...style,
  }

  return (
    <div style={{ width: '100%' }}>
      {label && (
        <label style={{ display: 'block', marginBottom: spacing.sm, color: colors.gray[300], fontSize: '13px', fontWeight: 600 }}>
          {label}
        </label>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        style={baseStyle}
        {...props}
      />
      {error && (
        <div style={{ marginTop: spacing.xs, color: colors.danger, fontSize: '12px' }}>
          {error}
        </div>
      )}
    </div>
  )
}
