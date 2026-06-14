// Philia Vault — Design Tokens
export const COLORS = {
  // Backgrounds
  background: '#000000',
  surface: '#0c0e12',
  surfaceContainer: '#13161c',
  surfaceContainerHigh: '#1e2530',
  surfaceContainerHighest: '#2e3746',
  surfaceDim: '#0a0b0f',

  // Brand / Accent
  primary: '#ccff00',
  primaryDark: '#a3e635',
  secondary: '#a3e635',
  tertiary: '#8b5cf6',
  tertiaryDim: '#6d28d9',

  // Text
  onSurface: '#f8fafc',
  onSurfaceVariant: '#94a3b8',
  onPrimary: '#0c0e12',
  outline: '#475569',
  outlineVariant: 'rgba(255,255,255,0.08)',

  // Status
  error: '#ef4444',
  errorContainer: '#450a0a',
  success: '#22c55e',
  successContainer: 'rgba(34, 197, 94, 0.15)',
  warning: '#f59e0b',

  // Transparent overlays
  glass: 'rgba(20, 24, 33, 0.65)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  overlay: 'rgba(0,0,0,0.6)',

  // Chart colors
  cyan: '#06b6d4',
  rose: '#f43f5e',
};

export const FONTS = {
  display: { fontFamily: 'Montserrat-Bold', fontSize: 48, lineHeight: 56 },
  headlineLg: { fontFamily: 'Montserrat-Bold', fontSize: 28, lineHeight: 36 },
  headlineMd: { fontFamily: 'Montserrat-SemiBold', fontSize: 20, lineHeight: 28 },
  headlineSm: { fontFamily: 'Montserrat-SemiBold', fontSize: 16, lineHeight: 24 },
  bodyLg: { fontFamily: 'PlusJakartaSans-Regular', fontSize: 18, lineHeight: 28 },
  bodyMd: { fontFamily: 'PlusJakartaSans-Regular', fontSize: 16, lineHeight: 24 },
  bodySm: { fontFamily: 'PlusJakartaSans-Regular', fontSize: 14, lineHeight: 20 },
  labelMd: { fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 12, lineHeight: 16 },
  labelSm: { fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 11, lineHeight: 16, letterSpacing: 0.5 },
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
};

export const SHADOW = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  }),
};
