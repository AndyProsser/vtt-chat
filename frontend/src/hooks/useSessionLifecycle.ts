/**
 * useSessionLifecycle Hook
 * Manages session hydration, reconnection, and lifecycle effects.
 * Coordinates WebSocket state with session topology and audio state recovery.
 */

import { useRef, useState } from 'react'
import type { ConnectionState } from '@/ws/client'

interface UseSessionLifecycleState {
  wsRetryWindowExpired: boolean
  wsRetrySecondsRemaining: number | null
}

interface UseSessionLifecycleRefs {
  prevWsStateRef: React.MutableRefObject<ConnectionState>
  wsTelemetryPrevRef: React.MutableRefObject<ConnectionState | null>
  lastHydratedSessionFingerprintRef: React.MutableRefObject<string | null>
  wsRetryWindowStartRef: React.MutableRefObject<number | null>
  wsRetryToastTimerRef: React.MutableRefObject<number | null>
  wsErrorMessageRef: React.MutableRefObject<string | null>
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

  const state: UseSessionLifecycleState = {
    wsRetryWindowExpired,
    wsRetrySecondsRemaining,
  }

  const actions: UseSessionLifecycleActions = {
    setWsRetryWindowExpired,
    setWsRetrySecondsRemaining,
  }

  const refs: UseSessionLifecycleRefs = {
    prevWsStateRef,
    wsTelemetryPrevRef,
    lastHydratedSessionFingerprintRef,
    wsRetryWindowStartRef,
    wsRetryToastTimerRef,
    wsErrorMessageRef,
  }

  return [state, actions, refs]
}

export type { UseSessionLifecycleState, UseSessionLifecycleActions, UseSessionLifecycleRefs }
