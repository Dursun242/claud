/**
 * DESIGN SYSTEM - ID Maîtrise
 * Tokens centralisés pour cohérence globale
 */

// ════════════════════════════════════════════════════
// 🎨 PALETTE DE COULEURS
// ════════════════════════════════════════════════════

export const colors = {
  // ─── NEUTRES ───
  white: '#FFFFFF',
  black: '#000000',

  // ─── GRAYS (Dark mode)
  gray: {
    950: '#030712', // Background très sombre
    900: '#0F172A', // Background principal
    850: '#1A202C', // Surfaces secondaires
    800: '#1E293B', // Cards, panels
    700: '#334155', // Borders, dividers
    600: '#475569', // Texte secondaire
    500: '#64748B', // Texte tertaire
    400: '#94A3B8', // Labels, hints
    300: '#CBD5E1', // Disabled
    200: '#E2E8F0', // Texte clair
    100: '#F1F5F9', // Très clair
  },

  // ─── PRIMAIRE (Bleu)
  primary: {
    900: '#0C2A4A',
    800: '#0F3460',
    700: '#1E3A8A',
    600: '#2563EB', // Main
    500: '#3B82F6',
    400: '#60A5FA',
    300: '#93C5FD',
    200: '#BFDBFE',
    100: '#DBEAFE',
  },

  // ─── SECONDAIRES
  secondary: {
    purple: '#7C3AED',
    pink: '#EC4899',
    orange: '#F97316',
  },

  // ─── STATUS
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',

  // ─── GRADIENTS
  gradient: {
    primary: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)',
    success: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
    danger: 'linear-gradient(135deg, #EF4444 0%, #F87171 100%)',
  },
};

// ════════════════════════════════════════════════════
// 🔤 TYPOGRAPHIES
// ════════════════════════════════════════════════════

export const typography = {
  // ─── HEADERS ───
  h1: {
    fontSize: '32px',
    fontWeight: 700,
    lineHeight: '1.2',
    letterSpacing: '-0.5px',
  },
  h2: {
    fontSize: '24px',
    fontWeight: 700,
    lineHeight: '1.3',
    letterSpacing: '-0.3px',
  },
  h3: {
    fontSize: '20px',
    fontWeight: 600,
    lineHeight: '1.4',
  },

  // ─── BODY ───
  body: {
    lg: { fontSize: '16px', fontWeight: 400, lineHeight: '1.6' },
    base: { fontSize: '14px', fontWeight: 400, lineHeight: '1.5' },
    sm: { fontSize: '13px', fontWeight: 400, lineHeight: '1.5' },
    xs: { fontSize: '12px', fontWeight: 400, lineHeight: '1.4' },
  },

  // ─── LABELS & CAPTIONS ───
  label: {
    fontSize: '13px',
    fontWeight: 600,
    lineHeight: '1.5',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  caption: {
    fontSize: '11px',
    fontWeight: 500,
    lineHeight: '1.4',
  },
};

// ════════════════════════════════════════════════════
// 📏 ESPACEMENTS
// ════════════════════════════════════════════════════

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '32px',
  '4xl': '40px',
  '5xl': '48px',
};

// ════════════════════════════════════════════════════
// 🔲 BORDER RADIUS
// ════════════════════════════════════════════════════

export const radius = {
  none: '0',
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
  full: '9999px',
};

// ════════════════════════════════════════════════════
// 💫 SHADOWS
// ════════════════════════════════════════════════════

export const shadows = {
  none: 'none',
  xs: '0 1px 2px rgba(0, 0, 0, 0.05)',
  sm: '0 1px 3px rgba(0, 0, 0, 0.1)',
  md: '0 4px 6px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px rgba(0, 0, 0, 0.15)',
  xl: '0 20px 25px rgba(0, 0, 0, 0.2)',
  inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.1)',
};

// ════════════════════════════════════════════════════
// ⏱️ ANIMATIONS & TRANSITIONS
// ════════════════════════════════════════════════════

export const transitions = {
  fast: '150ms ease-in-out',
  base: '200ms ease-in-out',
  slow: '300ms ease-in-out',
};

// ════════════════════════════════════════════════════
// 🎯 BREAKPOINTS (Responsive)
// ════════════════════════════════════════════════════

export const breakpoints = {
  mobile: 480,
  tablet: 768,
  desktop: 1024,
  wide: 1280,
};

// ════════════════════════════════════════════════════
// 🧩 COMMON STYLES
// ════════════════════════════════════════════════════

export const styles = {
  // Cards & Surfaces
  card: {
    background: colors.gray[800],
    border: `1px solid ${colors.gray[700]}`,
    borderRadius: radius.xl,
    padding: spacing.lg,
    boxShadow: shadows.sm,
  },

  cardHover: {
    transition: `all ${transitions.base}`,
    cursor: 'pointer',
    '&:hover': {
      borderColor: colors.gray[600],
      boxShadow: shadows.md,
    },
  },

  // Inputs & Form
  input: {
    background: colors.gray[900],
    border: `1px solid ${colors.gray[700]}`,
    borderRadius: radius.md,
    padding: `${spacing.md} ${spacing.lg}`,
    color: colors.gray[200],
    fontSize: '14px',
    transition: `all ${transitions.base}`,
    '&:focus': {
      outline: 'none',
      borderColor: colors.primary[600],
      boxShadow: `0 0 0 3px ${colors.primary[100]}40`,
    },
    '&:disabled': {
      background: colors.gray[800],
      color: colors.gray[500],
      cursor: 'not-allowed',
    },
  },

  // Buttons
  buttonBase: {
    padding: `${spacing.md} ${spacing.xl}`,
    borderRadius: radius.md,
    border: 'none',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: `all ${transitions.base}`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },

  buttonPrimary: {
    background: colors.primary[600],
    color: colors.white,
    '&:hover': {
      background: colors.primary[700],
      boxShadow: shadows.md,
    },
    '&:active': {
      background: colors.primary[800],
    },
  },

  buttonSecondary: {
    background: colors.gray[800],
    color: colors.gray[200],
    border: `1px solid ${colors.gray[700]}`,
    '&:hover': {
      background: colors.gray[700],
      borderColor: colors.gray[600],
    },
  },

  buttonDanger: {
    background: colors.danger,
    color: colors.white,
    '&:hover': {
      background: '#DC2626',
    },
  },

  // Text
  textBase: {
    color: colors.gray[200],
  },

  textSecondary: {
    color: colors.gray[400],
  },

  textMuted: {
    color: colors.gray[500],
  },

  // Dividers
  divider: {
    background: colors.gray[700],
    height: '1px',
    border: 'none',
  },
};
