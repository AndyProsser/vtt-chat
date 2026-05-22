import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UUID } from '@shared'
import { Slider, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import '@/styles/components/dev/MockTestingPanel.css'

interface MockSimulationConfig {
  speakingSimulatorEnabled: boolean
  chatSimulatorEnabled: boolean
  disconnectSimulatorEnabled: boolean
  multiDeviceSimulatorEnabled: boolean
  playerCount: number
}

interface MockSimulationStatusResponse {
  sessionId: UUID
  config: MockSimulationConfig
  isRunning: boolean
  activeMockCount: number
  speakingNow: UUID[]
  uptime: number
  messagesSentLastMinuteByType?: {
    IC: number
    OOC: number
    WHISPER: number
    DM: number
  }
  bounds?: { min: number; max: number }
}

interface MockTestingPanelProps {
  apiUrl: string
  token: string
  sessionId: UUID
  activeTakeoverUserId?: UUID | null
  onReturnToUser?: () => Promise<void>
  onClose?: () => void
}

export function MockTestingPanel({
  apiUrl,
  token,
  sessionId,
  activeTakeoverUserId,
  onReturnToUser,
  onClose,
}: MockTestingPanelProps) {
  const STATUS_POLL_ACTIVE_MS = 2500
  const STATUS_POLL_IDLE_MS = 8000
  const [playerCount, setPlayerCount] = useState(8)
  const [config, setConfig] = useState<MockSimulationConfig>({
    speakingSimulatorEnabled: true,
    chatSimulatorEnabled: false,
    disconnectSimulatorEnabled: false,
    multiDeviceSimulatorEnabled: false,
    playerCount: 8,
  })
  const [status, setStatus] = useState<MockSimulationStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [playerBounds, setPlayerBounds] = useState<{ min: number; max: number }>({
    min: 1,
    max: 9,
  })
  const [messageRateHistory, setMessageRateHistory] = useState<number[]>([])
  const isPlayerCountDirtyRef = useRef(false)

  const applyStatusSnapshot = useCallback(
    (data: MockSimulationStatusResponse, options?: { forcePlayerCountSync?: boolean }) => {
      const forcePlayerCountSync = options?.forcePlayerCountSync || false

      setStatus(data)
      setConfig(data.config)
      if (forcePlayerCountSync || !isPlayerCountDirtyRef.current) {
        setPlayerCount(data.config.playerCount)
      }

      const byType = data.messagesSentLastMinuteByType
      const totalPerMinute = byType
        ? Number(byType.IC || 0) +
          Number(byType.OOC || 0) +
          Number(byType.WHISPER || 0) +
          Number(byType.DM || 0)
        : 0
      setMessageRateHistory((prev) => [...prev.slice(-9), totalPerMinute])

      if (data.bounds && Number.isFinite(data.bounds.min) && Number.isFinite(data.bounds.max)) {
        setPlayerBounds({
          min: Number(data.bounds.min),
          max: Number(data.bounds.max),
        })
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

  const handlePlayerCountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const requested = parseInt(e.target.value, 10)
      const newCount = Math.max(playerBounds.min, Math.min(playerBounds.max, requested))
      isPlayerCountDirtyRef.current = true
      setPlayerCount(newCount)
    },
    [playerBounds.max, playerBounds.min]
  )

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
    return `${status.activeMockCount} active, ${speakingCount} speaking`
  }, [status])

  const messageRateText = useMemo(() => {
    if (!status?.messagesSentLastMinuteByType) {
      return 'Messages/min: IC 0, OOC 0, Whisper 0, DM 0'
    }

    const byType = status.messagesSentLastMinuteByType
    return `Messages/min: IC ${byType.IC}, OOC ${byType.OOC}, Whisper ${byType.WHISPER}, DM ${byType.DM}`
  }, [status])

  const sparklinePoints = useMemo(() => {
    if (messageRateHistory.length === 0) {
      return ''
    }

    const width = 120
    const height = 26
    const paddingX = 3
    const paddingY = 3
    const maxValue = Math.max(1, ...messageRateHistory)
    const stepX =
      messageRateHistory.length > 1 ? (width - paddingX * 2) / (messageRateHistory.length - 1) : 0

    return messageRateHistory
      .map((value, index) => {
        const x = paddingX + index * stepX
        const y = height - paddingY - (value / maxValue) * (height - paddingY * 2)
        return `${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ')
  }, [messageRateHistory])

  const sparklineNow = messageRateHistory[messageRateHistory.length - 1] || 0

  return (
    <div className="mock-testing-panel" data-mock-testing-panel>
      <div className="mock-testing-panel__content">
        {/* Mock Players Count */}
        <div className="mock-testing-panel__row">
          <label className="mock-testing-panel__label">Mock Players</label>
          <div className="mock-testing-panel__slider-row">
            <Slider
              min={String(playerBounds.min)}
              max={String(playerBounds.max)}
              value={playerCount}
              onValueChange={(nextValue) =>
                handlePlayerCountChange({
                  target: { value: String(nextValue) },
                } as React.ChangeEvent<HTMLInputElement>)
              }
              onValueCommit={() => {
                void handlePlayerCountCommit()
              }}
              className="mock-testing-panel__slider"
              disabled={isLoading}
            />
            <span className="mock-testing-panel__value">{playerCount}</span>
            <TooltipProvider delayDuration={140}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="mock-testing-panel__icon-button"
                    onClick={handleReroll}
                    disabled={isLoading}
                    aria-label="Reroll mock players"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      refresh
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Reroll with current count</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Simulator Toggles */}
        <div className="mock-testing-panel__row">
          <label className="mock-testing-panel__label">Speaking</label>
          <button
            type="button"
            role="switch"
            aria-checked={config.speakingSimulatorEnabled}
            className={`mock-testing-panel__toggle ${config.speakingSimulatorEnabled ? 'is-on' : ''}`}
            onClick={() =>
              void updateConfig({ speakingSimulatorEnabled: !config.speakingSimulatorEnabled })
            }
            disabled={isLoading}
          >
            {config.speakingSimulatorEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="mock-testing-panel__row">
          <label className="mock-testing-panel__label">Chat</label>
          <button
            type="button"
            role="switch"
            aria-checked={config.chatSimulatorEnabled}
            className={`mock-testing-panel__toggle ${config.chatSimulatorEnabled ? 'is-on' : ''}`}
            onClick={() =>
              void updateConfig({ chatSimulatorEnabled: !config.chatSimulatorEnabled })
            }
            disabled={isLoading}
          >
            {config.chatSimulatorEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="mock-testing-panel__row">
          <label className="mock-testing-panel__label">Disconnect</label>
          <button
            type="button"
            role="switch"
            aria-checked={config.disconnectSimulatorEnabled}
            className={`mock-testing-panel__toggle ${config.disconnectSimulatorEnabled ? 'is-on' : ''}`}
            onClick={() =>
              void updateConfig({ disconnectSimulatorEnabled: !config.disconnectSimulatorEnabled })
            }
            disabled={isLoading}
          >
            {config.disconnectSimulatorEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="mock-testing-panel__row">
          <label className="mock-testing-panel__label">Multi-Device</label>
          <button
            type="button"
            role="switch"
            aria-checked={config.multiDeviceSimulatorEnabled}
            className={`mock-testing-panel__toggle ${config.multiDeviceSimulatorEnabled ? 'is-on' : ''}`}
            onClick={() =>
              void updateConfig({
                multiDeviceSimulatorEnabled: !config.multiDeviceSimulatorEnabled,
              })
            }
            disabled={isLoading}
          >
            {config.multiDeviceSimulatorEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Remove All Button */}
        <button
          className="mock-testing-panel__action-button mock-testing-panel__action-button--danger"
          onClick={handleRemoveAll}
          disabled={isLoading}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            delete
          </span>
          Remove All
        </button>

        {activeTakeoverUserId ? (
          <button
            className="mock-testing-panel__action-button mock-testing-panel__action-button--takeover-exit"
            onClick={() => {
              void onReturnToUser?.()
            }}
            disabled={isLoading || !onReturnToUser}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              undo
            </span>
            Return to My User
          </button>
        ) : null}

        {/* Status Display */}
        <div className="mock-testing-panel__status">Status: {statusText}</div>
        <div className="mock-testing-panel__status">{messageRateText}</div>
        <div
          className="mock-testing-panel__trend"
          aria-label="Message rate trend over last 10 polls"
        >
          <div className="mock-testing-panel__trend-label">Trend (last 10 polls)</div>
          <svg
            className="mock-testing-panel__sparkline"
            viewBox="0 0 120 26"
            role="img"
            aria-label={`Current messages per minute total: ${sparklineNow}`}
          >
            <polyline
              points={sparklinePoints}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  )
}
