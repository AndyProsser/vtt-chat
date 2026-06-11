import { createTheme } from '@mui/material/styles'

export type AdminThemeMode = 'dark' | 'light'

const adminThemeTokens = {
  dark: {
    primary: '#4c8dff',
    background: '#0f141d',
    surface: '#171d27',
    textPrimary: '#e8eef8',
    textSecondary: '#a8b5cb',
    border: '#2e3a4b',
  },
  light: {
    primary: '#2563eb',
    background: '#f3f5f8',
    surface: '#ffffff',
    textPrimary: '#101827',
    textSecondary: '#4b5563',
    border: '#dbe2ea',
  },
} as const

export function getAdminTheme(mode: AdminThemeMode) {
  const tokens = adminThemeTokens[mode]

  return createTheme({
    palette: {
      mode,
      primary: {
        main: tokens.primary,
      },
      background: {
        default: tokens.background,
        paper: tokens.surface,
      },
      text: {
        primary: tokens.textPrimary,
        secondary: tokens.textSecondary,
      },
      divider: tokens.border,
    },
    shape: {
      borderRadius: 10,
    },
    typography: {
      fontFamily: "Inter, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    },
  })
}
