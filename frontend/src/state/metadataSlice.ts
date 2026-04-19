/**
 * Metadata Slice (Zustand)
 * Manages global metadata and application state.
 */

import type { StateCreator } from 'zustand'
import type { UUID, Role } from '@shared'
import type { EventEnvelope } from '@shared'

export interface User {
  id: UUID
  username: string
  role: Role
}

export interface MetadataSlice {
  // State
  currentUser: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error?: string

  // Actions
  setCurrentUser: (user: User | null) => void
  setIsAuthenticated: (authenticated: boolean) => void
  setIsLoading: (loading: boolean) => void
  setError: (error?: string) => void
  clearMetadata: () => void

  // Event handlers
  handleConnectionEstablished: (event: EventEnvelope) => void
}

export const createMetadataSlice: StateCreator<MetadataSlice> = (set) => ({
  // State
  currentUser: null,
  isAuthenticated: false,
  isLoading: false,
  error: undefined,

  // Actions
  setCurrentUser: (user) =>
    set({
      currentUser: user,
    }),

  setIsAuthenticated: (authenticated) =>
    set({
      isAuthenticated: authenticated,
    }),

  setIsLoading: (loading) =>
    set({
      isLoading: loading,
    }),

  setError: (error) =>
    set({
      error,
    }),

  clearMetadata: () =>
    set({
      currentUser: null,
      isAuthenticated: false,
      isLoading: false,
      error: undefined,
    }),

  // Event handlers
  handleConnectionEstablished: (event) => {
    const payload = event.payload as {
      userId: UUID
      username: string
      userRole: Role
      connectionId: string
    }

    set({
      currentUser: {
        id: payload.userId,
        username: payload.username,
        role: payload.userRole,
      },
      isAuthenticated: true,
      error: undefined,
    })
  },
})
