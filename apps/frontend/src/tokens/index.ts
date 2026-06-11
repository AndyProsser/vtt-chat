export const FRONTEND_THEME_ROOT_SELECTOR = ':root'

export const FRONTEND_THEME_CLASSES = {
  light: 'light',
  dark: 'dark',
} as const

export type FrontendThemeMode = keyof typeof FRONTEND_THEME_CLASSES

export const FRONTEND_TOKEN_KEYS = {
  surface: '--color-surface',
  surfaceSubtle: '--color-surface-subtle',
  border: '--color-border',
  textPrimary: '--color-text-primary',
  textSecondary: '--color-text-secondary',
  brand: '--color-brand',
} as const
