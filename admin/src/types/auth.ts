/** Admin role hierarchy (highest to lowest: SUPER_ADMIN > ADMIN > CAMPAIGN_DM > READ_ONLY). */
export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'CAMPAIGN_DM' | 'READ_ONLY'

/** Authenticated admin user profile carried in the store and JWT claims. */
export interface AdminUser {
  id: string
  username: string
  email: string
  adminRole?: AdminRole
}

/** Zustand auth store shape. */
export interface AuthState {
  token: string | null
  admin: AdminUser | null
  isAuthenticated: boolean
  loading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  setToken: (token: string, admin: AdminUser) => void
  initializeAuth: () => void
  clearError: () => void
}
