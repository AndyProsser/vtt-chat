import { create } from 'zustand'
import type { AdminUser, AuthState } from '@/types/auth'

export type { AdminUser, AuthState }

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000/api'

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  admin: null,
  isAuthenticated: false,
  loading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ loading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Login failed')
      }

      const data = await response.json()

      // Store token in sessionStorage
      sessionStorage.setItem('admin-token', data.token)

      set({
        token: data.token,
        admin: data.admin,
        isAuthenticated: true,
        loading: false,
        error: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed'
      set({
        loading: false,
        error: message,
        isAuthenticated: false,
        token: null,
        admin: null,
      })
      throw error
    }
  },

  logout: () => {
    sessionStorage.removeItem('admin-token')
    localStorage.removeItem('admin-token')
    set({
      token: null,
      admin: null,
      isAuthenticated: false,
      error: null,
    })
  },

  setToken: (token: string, admin: AdminUser) => {
    sessionStorage.setItem('admin-token', token)
    set({
      token,
      admin,
      isAuthenticated: true,
      loading: false,
      error: null,
    })
  },

  initializeAuth: () => {
    // Try to restore token from storage
    const token = sessionStorage.getItem('admin-token') || localStorage.getItem('admin-token')

    if (token) {
      set({
        token,
        isAuthenticated: true,
        loading: false,
      })
    } else {
      set({
        token: null,
        admin: null,
        isAuthenticated: false,
        loading: false,
      })
    }
  },

  clearError: () => {
    set({ error: null })
  },
}))
