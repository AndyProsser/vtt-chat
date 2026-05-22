import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UUID } from '@shared'
import { Slider, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import '@/styles/components/audio/MockPlayerControlPanel.css'

interface MockSimulationConfig {
  speakingSimulatorEnabled: boolean
  chatSimulatorEnabled: boolean
  disconnectSimulatorEnabled: boolean
  playerCount: number
}

interface MockSimulationStatusResponse {
  sessionId: UUID
  config: MockSimulationConfig
  isRunning: boolean
  activeMockCount: number
  speakingNow: UUID[]
  uptime: number
}

interface MockPlayerControlPanelProps {
  apiUrl: string
  token: string
  sessionId: UUID
  onClose?: () => void
}

export function MockPlayerControlPanel({
  apiUrl,
  token,
  sessionId,
  onClose,
}: MockPlayerControlPanelProps) {
  const STATUS_POLL_ACTIVE_MS = 2500
  const STATUS_POLL_IDLE_MS = 8000
  const [playerCount, setPlayerCount] = useState(8)
  const [config, setConfig] = useState<MockSimulationConfig>({
    speakingSimulatorEnabled: true,
    chatSimulatorEnabled: false,
    disconnectSimulatorEnabled: false,
    playerCount: 8,
  })
  const [status, setStatus] = useState<MockSimulationStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const isPlayerCountDirtyRef = useRef(false)

  const applyStatusSnapshot = useCallback(
    (data: MockSimulationStatusResponse, options?: { forcePlayerCountSync?: boolean }) => {
      const forcePlayerCountSync = options?.forcePlayerCountSync || false
      setStatus(data)
      setConfig(data.config)
      if (forcePlayerCountSync || !isPlayerCountDirtyRef.current) {
        setPlayerCount(data.config.playerCount)
      }
    },
    []
  )

  const fetchStatus = useCallback(async () => {
    const response = await fetch(`${apiUrl}/api/dev/mock-players/simulation/status/${sessionId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return (await response.json()) as MockSimulationStatusResponse
  }, [apiUrl, sessionId, token])

  // Poll status while the panel is open, avoiding overlapping requests.
  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const pollStatus = async () => {
      if (cancelled) {
        return
      }

      try {
        const data = await fetchStatus()
        if (cancelled) {
          return
        }
        applyStatusSnapshot(data)
      } catch (error) {
        console.error('Failed to poll mock player status:', error)
      } finally {
        if (cancelled) {
          return
        }

        const hidden = typeof document !== 'undefined' && document.visibilityState !== 'visible'
        const nextDelay = hidden || !status?.isRunning ? STATUS_POLL_IDLE_MS : STATUS_POLL_ACTIVE_MS
        timeoutId = setTimeout(pollStatus, nextDelay)
      }
    }

    pollStatus() // Initial fetch

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [applyStatusSnapshot, fetchStatus, status?.isRunning])

  const updateConfig = useCallback(
    async (newConfig: Partial<MockSimulationConfig>) => {
      const updatedConfig = { ...config, ...newConfig }
      setConfig(updatedConfig)
      setIsLoading(true)

      try {
        const response = await fetch(`${apiUrl}/api/dev/mock-players/simulation/settings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionId,
            config: updatedConfig,
          }),
        })

        if (!response.ok) {
          console.error('Failed to update mock player config')
          setConfig(config) // Revert on error
          return
        }

        try {
          const latest = await fetchStatus()
          applyStatusSnapshot(latest)
        } catch (refreshError) {
          console.error('Failed to refresh mock player status after config update:', refreshError)
        }
      } catch (error) {
        console.error('Failed to update mock player config:', error)
        setConfig(config) // Revert on error
      } finally {
        setIsLoading(false)
      }
    },
    [apiUrl, token, sessionId, config, fetchStatus, applyStatusSnapshot]
  )

  const handlePlayerCountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newCount = parseInt(e.target.value, 10)
    isPlayerCountDirtyRef.current = true
    setPlayerCount(newCount)
  }, [])

  const handlePlayerCountCommit = useCallback(async () => {
    if (playerCount === config.playerCount) {
      isPlayerCountDirtyRef.current = false
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`${apiUrl}/api/dev/mock-players/reroll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          newPlayerCount: playerCount,
        }),
      })

      if (response.ok) {
        isPlayerCountDirtyRef.current = false
        setConfig((prev) => ({ ...prev, playerCount }))
        try {
          const latest = await fetchStatus()
          applyStatusSnapshot(latest, { forcePlayerCountSync: true })
        } catch (refreshError) {
          console.error('Failed to refresh mock player status after reroll:', refreshError)
        }
      } else {
        console.error('Failed to reroll mock players')
        isPlayerCountDirtyRef.current = false
        setPlayerCount(config.playerCount) // Revert on error
      }
    } catch (error) {
      console.error('Failed to reroll mock players:', error)
      isPlayerCountDirtyRef.current = false
      setPlayerCount(config.playerCount) // Revert on error
    } finally {
      setIsLoading(false)
    }
  }, [apiUrl, token, sessionId, playerCount, config.playerCount, fetchStatus, applyStatusSnapshot])

  const handleReroll = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`${apiUrl}/api/dev/mock-players/reroll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          newPlayerCount: config.playerCount,
        }),
      })

      if (!response.ok) {
        console.error('Failed to reroll mock players')
        return
      }

      try {
        const latest = await fetchStatus()
        applyStatusSnapshot(latest, { forcePlayerCountSync: true })
      } catch (refreshError) {
        console.error('Failed to refresh mock player status after reroll:', refreshError)
      }
    } catch (error) {
      console.error('Failed to reroll mock players:', error)
    } finally {
      setIsLoading(false)
    }
  }, [apiUrl, token, sessionId, config.playerCount, fetchStatus, applyStatusSnapshot])

  const handleRemoveAll = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`${apiUrl}/api/dev/mock-players/disconnect-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          gracefulShutdown: true,
        }),
      })

      if (!response.ok) {
        console.error('Failed to remove mock players')
        return
      }

      onClose?.()

      try {
        const latest = await fetchStatus()
        applyStatusSnapshot(latest, { forcePlayerCountSync: true })
      } catch (refreshError) {
        console.error('Failed to refresh mock player status after removal:', refreshError)
      }
    } catch (error) {
      console.error('Failed to remove mock players:', error)
    } finally {
      setIsLoading(false)
    }
  }, [apiUrl, token, sessionId, fetchStatus, applyStatusSnapshot, onClose])

  const statusText = useMemo(() => {
    if (!status) return 'Loading...'
    const speakingCount = status.speakingNow?.length || 0
    return `${status.activeMockCount} active mocks, ${speakingCount} speaking`
  }, [status])

  return (
    <div className="mock-player-control-panel" data-mock-control-panel>
      <div className="mock-player-control-panel__content">
        {/* Player Count Slider */}
        <div className="mock-player-control-panel__row">
          <label className="mock-player-control-panel__label">Player Count:</label>
          <Slider
            min={1}
            max={20}
            value={playerCount}
            onValueChange={(nextValue) =>
              handlePlayerCountChange({
                target: { value: String(nextValue) },
              } as React.ChangeEvent<HTMLInputElement>)
            }
            onValueCommit={() => {
              void handlePlayerCountCommit()
            }}
            className="mock-player-control-panel__slider"
            disabled={isLoading}
          />
          <span className="mock-player-control-panel__count">{playerCount}</span>
          <TooltipProvider delayDuration={140}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="mock-player-control-panel__button mock-player-control-panel__button--icon"
                  onClick={handleReroll}
                  disabled={isLoading}
                  aria-label="Reroll with same player count"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    refresh
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Reroll with same player count</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Simulator Toggles */}
        <div className="mock-player-control-panel__row">
          <label className="mock-player-control-panel__label">🎤 Speaking:</label>
          <div className="mock-player-control-panel__toggle-buttons">
            <button
              className={`mock-player-control-panel__button ${
                config.speakingSimulatorEnabled ? 'mock-player-control-panel__button--active' : ''
              }`}
              onClick={() => updateConfig({ speakingSimulatorEnabled: true })}
              disabled={isLoading || config.speakingSimulatorEnabled}
            >
              ON
            </button>
            <button
              className={`mock-player-control-panel__button ${
                !config.speakingSimulatorEnabled ? 'mock-player-control-panel__button--active' : ''
              }`}
              onClick={() => updateConfig({ speakingSimulatorEnabled: false })}
              disabled={isLoading || !config.speakingSimulatorEnabled}
            >
              OFF
            </button>
          </div>
        </div>

        <div className="mock-player-control-panel__row">
          <label className="mock-player-control-panel__label">💬 Chat:</label>
          <div className="mock-player-control-panel__toggle-buttons">
            <button
              className={`mock-player-control-panel__button ${
                config.chatSimulatorEnabled ? 'mock-player-control-panel__button--active' : ''
              }`}
              onClick={() => updateConfig({ chatSimulatorEnabled: true })}
              disabled={isLoading || config.chatSimulatorEnabled}
            >
              ON
            </button>
            <button
              className={`mock-player-control-panel__button ${
                !config.chatSimulatorEnabled ? 'mock-player-control-panel__button--active' : ''
              }`}
              onClick={() => updateConfig({ chatSimulatorEnabled: false })}
              disabled={isLoading || !config.chatSimulatorEnabled}
            >
              OFF
            </button>
          </div>
        </div>

        <div className="mock-player-control-panel__row">
          <label className="mock-player-control-panel__label">🌐 Disconnect:</label>
          <div className="mock-player-control-panel__toggle-buttons">
            <button
              className={`mock-player-control-panel__button ${
                config.disconnectSimulatorEnabled ? 'mock-player-control-panel__button--active' : ''
              }`}
              onClick={() => updateConfig({ disconnectSimulatorEnabled: true })}
              disabled={isLoading || config.disconnectSimulatorEnabled}
            >
              ON
            </button>
            <button
              className={`mock-player-control-panel__button ${
                !config.disconnectSimulatorEnabled
                  ? 'mock-player-control-panel__button--active'
                  : ''
              }`}
              onClick={() => updateConfig({ disconnectSimulatorEnabled: false })}
              disabled={isLoading || !config.disconnectSimulatorEnabled}
            >
              OFF
            </button>
          </div>
        </div>

        {/* Remove All Button */}
        <button
          className="mock-player-control-panel__action-button mock-player-control-panel__action-button--danger"
          onClick={handleRemoveAll}
          disabled={isLoading}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            delete
          </span>
          REMOVE ALL MOCKS
        </button>

        {/* Status Display */}
        <div className="mock-player-control-panel__status">Status: {statusText}</div>
      </div>
    </div>
  )
}
