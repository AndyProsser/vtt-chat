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
  token: localStorage.getItem('admin_token'),
  isAuthenticated: !!localStorage.getItem('admin_token'),
  loading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ loading: true, error: null })
    try {
      const response = await fetch('/admin/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        throw new Error('Login failed')
      }

      const data = await response.json()
      localStorage.setItem('admin_token', data.token)
      set({ token: data.token, isAuthenticated: true, loading: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed'
      set({ error: message, loading: false })
      throw error
    }
  },

  logout: () => {
    localStorage.removeItem('admin_token')
    set({ token: null, isAuthenticated: false, error: null })
  },

  initializeAuth: () => {
    const token = localStorage.getItem('admin_token')
    set({ token, isAuthenticated: !!token })
  },
}))
