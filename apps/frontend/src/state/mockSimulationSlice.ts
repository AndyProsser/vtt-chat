import type { StateCreator } from 'zustand'
import type { UUID } from '@shared'
import type { MockSimulationConfig, MockSimulationStatusResponse } from '@/types/mockSimulation'
import { logger } from '@/utils/logger'

type MockSimulationRequestContext = {
  apiUrl: string
  token: string
  sessionId: UUID
}

const DEFAULT_MOCK_SIMULATION_CONFIG: MockSimulationConfig = {
  speakingSimulatorEnabled: true,
  chatSimulatorEnabled: false,
  disconnectSimulatorEnabled: false,
  multiDeviceSimulatorEnabled: false,
  playerCount: 8,
}

const DEFAULT_MESSAGE_RATES = {
  IC: 0,
  OOC: 0,
  WHISPER: 0,
  DM: 0,
}

function isSimulatorActive(config: MockSimulationConfig): boolean {
  return Boolean(
    config.speakingSimulatorEnabled ||
    config.chatSimulatorEnabled ||
    config.disconnectSimulatorEnabled ||
    config.multiDeviceSimulatorEnabled
  )
}

function buildFallbackStatus(sessionId: UUID): MockSimulationStatusResponse {
  return {
    sessionId,
    config: DEFAULT_MOCK_SIMULATION_CONFIG,
    isRunning: false,
    activeMockCount: 0,
    speakingNow: [],
    uptime: 0,
    messagesSentLastMinuteByType: DEFAULT_MESSAGE_RATES,
    bounds: { min: 1, max: 19 },
  }
}

function applyConfigToStatus(
  sessionId: UUID,
  current: MockSimulationStatusResponse | null | undefined,
  config: MockSimulationConfig
): MockSimulationStatusResponse {
  const base = current || buildFallbackStatus(sessionId)

  return {
    ...base,
    config,
    isRunning: isSimulatorActive(config),
    speakingNow: isSimulatorActive(config) ? base.speakingNow : [],
  }
}

function buildExitedStatus(
  sessionId: UUID,
  current: MockSimulationStatusResponse | null | undefined
): MockSimulationStatusResponse {
  const base = current || buildFallbackStatus(sessionId)
  const config = {
    ...base.config,
    speakingSimulatorEnabled: false,
    chatSimulatorEnabled: false,
    disconnectSimulatorEnabled: false,
    multiDeviceSimulatorEnabled: false,
  }

  return {
    ...base,
    config,
    isRunning: false,
    speakingNow: [],
  }
}

async function requestJson<T>(
  input: RequestInfo,
  init: RequestInit,
  errorLabel: string
): Promise<T> {
  const response = await fetch(input, init)
  if (!response.ok) {
    throw new Error(`${errorLabel}: HTTP ${response.status}`)
  }

  return (await response.json()) as T
}

export interface MockSimulationSlice {
  mockSimulationStatusBySession: Record<string, MockSimulationStatusResponse | null>
  mockSimulationLoadingBySession: Record<string, boolean>

  fetchMockSimulationStatus: (
    params: MockSimulationRequestContext
  ) => Promise<MockSimulationStatusResponse | null>
  updateMockSimulationConfig: (
    params: MockSimulationRequestContext & { config: Partial<MockSimulationConfig> }
  ) => Promise<MockSimulationStatusResponse | null>
  rerollMockSimulationPlayers: (
    params: MockSimulationRequestContext & { newPlayerCount: number }
  ) => Promise<MockSimulationStatusResponse | null>
  removeMockPlayers: (params: MockSimulationRequestContext) => Promise<boolean>
  markMockSimulationExited: (sessionId: UUID) => void
  clearMockSimulationState: (sessionId?: UUID) => void
}

export const createMockSimulationSlice: StateCreator<MockSimulationSlice> = (set, get) => ({
  mockSimulationStatusBySession: {},
  mockSimulationLoadingBySession: {},

  fetchMockSimulationStatus: async ({ apiUrl, token, sessionId }) => {
    set((state) => ({
      mockSimulationLoadingBySession: {
        ...state.mockSimulationLoadingBySession,
        [sessionId]: true,
      },
    }))

    try {
      const status = await requestJson<MockSimulationStatusResponse>(
        `${apiUrl}/api/dev/mock-players/simulation/status/${sessionId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Cache-Control': 'no-cache',
          },
          cache: 'no-store',
        },
        'Failed to fetch mock simulation status'
      )

      set((state) => ({
        mockSimulationStatusBySession: {
          ...state.mockSimulationStatusBySession,
          [sessionId]: status,
        },
      }))

      return status
    } catch (error) {
      logger.error('mock-simulation-slice', 'Failed to fetch mock simulation status', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    } finally {
      set((state) => ({
        mockSimulationLoadingBySession: {
          ...state.mockSimulationLoadingBySession,
          [sessionId]: false,
        },
      }))
    }
  },

  updateMockSimulationConfig: async ({ apiUrl, token, sessionId, config }) => {
    const previous = get().mockSimulationStatusBySession[sessionId]
    const optimistic = applyConfigToStatus(sessionId, previous, {
      ...(previous?.config || DEFAULT_MOCK_SIMULATION_CONFIG),
      ...config,
    })

    set((state) => ({
      mockSimulationStatusBySession: {
        ...state.mockSimulationStatusBySession,
        [sessionId]: optimistic,
      },
      mockSimulationLoadingBySession: {
        ...state.mockSimulationLoadingBySession,
        [sessionId]: true,
      },
    }))

    try {
      const response = await requestJson<{ config: MockSimulationConfig }>(
        `${apiUrl}/api/dev/mock-players/simulation/settings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionId, config }),
        },
        'Failed to update mock simulation config'
      )

      const nextStatus = applyConfigToStatus(
        sessionId,
        get().mockSimulationStatusBySession[sessionId],
        response.config
      )
      set((state) => ({
        mockSimulationStatusBySession: {
          ...state.mockSimulationStatusBySession,
          [sessionId]: nextStatus,
        },
      }))

      return nextStatus
    } catch (error) {
      logger.error('mock-simulation-slice', 'Failed to update mock simulation config', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      })

      set((state) => ({
        mockSimulationStatusBySession: {
          ...state.mockSimulationStatusBySession,
          [sessionId]: previous || null,
        },
      }))
      return null
    } finally {
      set((state) => ({
        mockSimulationLoadingBySession: {
          ...state.mockSimulationLoadingBySession,
          [sessionId]: false,
        },
      }))
    }
  },

  rerollMockSimulationPlayers: async ({ apiUrl, token, sessionId, newPlayerCount }) => {
    const previous = get().mockSimulationStatusBySession[sessionId]
    const currentConfig = previous?.config || DEFAULT_MOCK_SIMULATION_CONFIG

    set((state) => ({
      mockSimulationStatusBySession: {
        ...state.mockSimulationStatusBySession,
        [sessionId]: applyConfigToStatus(sessionId, previous, {
          ...currentConfig,
          playerCount: newPlayerCount,
        }),
      },
      mockSimulationLoadingBySession: {
        ...state.mockSimulationLoadingBySession,
        [sessionId]: true,
      },
    }))

    try {
      const response = await requestJson<{ playerCount?: number }>(
        `${apiUrl}/api/dev/mock-players/reroll`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionId, newPlayerCount }),
        },
        'Failed to reroll mock players'
      )

      const nextStatus = applyConfigToStatus(
        sessionId,
        get().mockSimulationStatusBySession[sessionId],
        {
          ...(get().mockSimulationStatusBySession[sessionId]?.config || currentConfig),
          playerCount: response.playerCount ?? newPlayerCount,
        }
      )

      set((state) => ({
        mockSimulationStatusBySession: {
          ...state.mockSimulationStatusBySession,
          [sessionId]: nextStatus,
        },
      }))

      return nextStatus
    } catch (error) {
      logger.error('mock-simulation-slice', 'Failed to reroll mock players', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      })

      set((state) => ({
        mockSimulationStatusBySession: {
          ...state.mockSimulationStatusBySession,
          [sessionId]: previous || null,
        },
      }))
      return null
    } finally {
      set((state) => ({
        mockSimulationLoadingBySession: {
          ...state.mockSimulationLoadingBySession,
          [sessionId]: false,
        },
      }))
    }
  },

  removeMockPlayers: async ({ apiUrl, token, sessionId }) => {
    set((state) => ({
      mockSimulationLoadingBySession: {
        ...state.mockSimulationLoadingBySession,
        [sessionId]: true,
      },
    }))

    try {
      await requestJson<{ ok: boolean }>(
        `${apiUrl}/api/dev/mock-players/disconnect-all`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionId,
            gracefulShutdown: true,
          }),
        },
        'Failed to remove mock players'
      )

      set((state) => ({
        mockSimulationStatusBySession: {
          ...state.mockSimulationStatusBySession,
          [sessionId]: {
            ...buildExitedStatus(sessionId, state.mockSimulationStatusBySession[sessionId]),
            activeMockCount: 0,
            speakingNow: [],
          },
        },
      }))

      return true
    } catch (error) {
      logger.error('mock-simulation-slice', 'Failed to remove mock players', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    } finally {
      set((state) => ({
        mockSimulationLoadingBySession: {
          ...state.mockSimulationLoadingBySession,
          [sessionId]: false,
        },
      }))
    }
  },

  markMockSimulationExited: (sessionId) =>
    set((state) => ({
      mockSimulationStatusBySession: {
        ...state.mockSimulationStatusBySession,
        [sessionId]: buildExitedStatus(sessionId, state.mockSimulationStatusBySession[sessionId]),
      },
    })),

  clearMockSimulationState: (sessionId) =>
    set((state) => {
      if (!sessionId) {
        return {
          mockSimulationStatusBySession: {},
          mockSimulationLoadingBySession: {},
        }
      }

      const nextStatus = { ...state.mockSimulationStatusBySession }
      delete nextStatus[sessionId]
      const nextLoading = { ...state.mockSimulationLoadingBySession }
      delete nextLoading[sessionId]

      return {
        mockSimulationStatusBySession: nextStatus,
        mockSimulationLoadingBySession: nextLoading,
      }
    }),
})
