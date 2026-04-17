import { create } from 'zustand'

interface AuthState {
  token: string | null
  isAuthenticated: boolean
  loading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  initializeAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  isAuthenticated: false,
  loading: false,
  error: null,

  login: async (_username: string, _password: string) => {
    set({ loading: true, error: null })
    set({
      loading: false,
      error: 'Admin authentication is not enabled in the baseline stage.',
      isAuthenticated: false,
      token: null,
    })
  },

  logout: () => {
    set({ token: null, isAuthenticated: false, error: null })
  },

  initializeAuth: () => {
    set({ token: null, isAuthenticated: false, error: null, loading: false })
  },
}))
