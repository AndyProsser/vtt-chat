/**
 * useSessionLifecycle Hook
 * Manages session hydration, reconnection, and lifecycle effects.
 * Coordinates WebSocket state with session topology and audio state recovery.
 */

import { useMemo, useRef, useState } from 'react'
import type { ConnectionState } from '@/ws/client'

interface UseSessionLifecycleState {
  wsRetryWindowExpired: boolean
  wsRetrySecondsRemaining: number | null
}

interface UseSessionLifecycleRefs {
  prevWsStateRef: React.RefObject<ConnectionState>
  wsTelemetryPrevRef: React.RefObject<ConnectionState | null>
  lastHydratedSessionFingerprintRef: React.RefObject<string | null>
  wsRetryWindowStartRef: React.RefObject<number | null>
  wsRetryToastTimerRef: React.RefObject<number | null>
  wsErrorMessageRef: React.RefObject<string | null>
}

interface UseSessionLifecycleActions {
  setWsRetryWindowExpired: (value: boolean) => void
  setWsRetrySecondsRemaining: (value: number | null) => void
}

export function useSessionLifecycle(): [
  UseSessionLifecycleState,
  UseSessionLifecycleActions,
  UseSessionLifecycleRefs,
] {
  const [wsRetryWindowExpired, setWsRetryWindowExpired] = useState(false)
  const [wsRetrySecondsRemaining, setWsRetrySecondsRemaining] = useState<number | null>(null)

  const prevWsStateRef = useRef<ConnectionState>('disconnected')
  const wsTelemetryPrevRef = useRef<ConnectionState | null>(null)
  const lastHydratedSessionFingerprintRef = useRef<string | null>(null)
  const wsRetryWindowStartRef = useRef<number | null>(null)
  const wsRetryToastTimerRef = useRef<number | null>(null)
  const wsErrorMessageRef = useRef<string | null>(null)

  const state: UseSessionLifecycleState = useMemo(
    () => ({
      wsRetryWindowExpired,
      wsRetrySecondsRemaining,
    }),
    [wsRetryWindowExpired, wsRetrySecondsRemaining]
  )

  const actions: UseSessionLifecycleActions = useMemo(
    () => ({
      setWsRetryWindowExpired,
      setWsRetrySecondsRemaining,
    }),
    []
  )

  const refs: UseSessionLifecycleRefs = useMemo(
    () => ({
      prevWsStateRef,
      wsTelemetryPrevRef,
      lastHydratedSessionFingerprintRef,
      wsRetryWindowStartRef,
      wsRetryToastTimerRef,
      wsErrorMessageRef,
    }),
    []
  )

  return [state, actions, refs]
}

export type { UseSessionLifecycleState, UseSessionLifecycleActions, UseSessionLifecycleRefs }
