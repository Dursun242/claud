/**
 * DESIGN SYSTEM - ID Maîtrise
 * Tokens centralisés pour cohérence globale
 * Optimisé pour performance et fluidité
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
// ⏱️ ANIMATIONS & TRANSITIONS (Fluide)
// ════════════════════════════════════════════════════

export const transitions = {
  // Cubic bezier pour plus de fluidité naturelle
  easeOut: 'cubic-bezier(0.33, 1, 0.68, 1)', // Decelerate
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)', // Standard
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  slowest: '500ms cubic-bezier(0.33, 1, 0.68, 1)',
};

// Animations prédéfinies (CSS keyframes)
export const getAnimationCSS = () => `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes shimmer {
    0% { background-position: -1000px 0; }
    100% { background-position: 1000px 0; }
  }

  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
  }
`;

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
    transition: `all ${transitions.base}`,
  },

  cardHover: {
    transition: `all ${transitions.base}`,
    cursor: 'pointer',
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

// ════════════════════════════════════════════════════
// ⚡ PERFORMANCE HELPERS
// ════════════════════════════════════════════════════

export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

// Mémorisation d'objets pour éviter les re-renders
export const memoizeObject = (obj) => {
  return JSON.stringify(obj);
};
