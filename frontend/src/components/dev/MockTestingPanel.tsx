import { useCallback, useEffect, useMemo, useState } from 'react'
import type { UUID } from '@shared'
import './MockTestingPanel.css'

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
  messagesSentLastMinuteByType?: {
    IC: number
    OOC: number
    WHISPER: number
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
}: MockTestingPanelProps) {
  const [playerCount, setPlayerCount] = useState(8)
  const [config, setConfig] = useState<MockSimulationConfig>({
    speakingSimulatorEnabled: true,
    chatSimulatorEnabled: false,
    disconnectSimulatorEnabled: false,
    playerCount: 8,
  })
  const [status, setStatus] = useState<MockSimulationStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [playerBounds, setPlayerBounds] = useState<{ min: number; max: number }>({
    min: 1,
    max: 9,
  })
  const [messageRateHistory, setMessageRateHistory] = useState<number[]>([])

  // Poll for status every 2s
  useEffect(() => {
    const pollStatus = async () => {
      try {
        const response = await fetch(
          `${apiUrl}/api/dev/mock-players/simulation/status/${sessionId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        )
        if (response.ok) {
          const data = await response.json()
          setStatus(data)
          setConfig(data.config)
          setPlayerCount(data.config.playerCount)
          const byType = data.messagesSentLastMinuteByType
          const totalPerMinute = byType
            ? Number(byType.IC || 0) + Number(byType.OOC || 0) + Number(byType.WHISPER || 0)
            : 0
          setMessageRateHistory((prev) => [...prev.slice(-9), totalPerMinute])
          if (data.bounds && Number.isFinite(data.bounds.min) && Number.isFinite(data.bounds.max)) {
            setPlayerBounds({
              min: Number(data.bounds.min),
              max: Number(data.bounds.max),
            })
          }
        }
      } catch (error) {
        console.error('Failed to poll mock player status:', error)
      }
    }

    const intervalId = setInterval(pollStatus, 2000)
    pollStatus() // Initial fetch

    return () => clearInterval(intervalId)
  }, [apiUrl, token, sessionId])

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
        }
      } catch (error) {
        console.error('Failed to update mock player config:', error)
        setConfig(config) // Revert on error
      } finally {
        setIsLoading(false)
      }
    },
    [apiUrl, token, sessionId, config]
  )

  const handlePlayerCountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const requested = parseInt(e.target.value, 10)
      const newCount = Math.max(playerBounds.min, Math.min(playerBounds.max, requested))
      setPlayerCount(newCount)
    },
    [playerBounds.max, playerBounds.min]
  )

  const handlePlayerCountCommit = useCallback(async () => {
    if (playerCount === config.playerCount) return

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
        setConfig((prev) => ({ ...prev, playerCount }))
      } else {
        console.error('Failed to reroll mock players')
        setPlayerCount(config.playerCount) // Revert on error
      }
    } catch (error) {
      console.error('Failed to reroll mock players:', error)
      setPlayerCount(config.playerCount) // Revert on error
    } finally {
      setIsLoading(false)
    }
  }, [apiUrl, token, sessionId, playerCount, config.playerCount])

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
      }
    } catch (error) {
      console.error('Failed to reroll mock players:', error)
    } finally {
      setIsLoading(false)
    }
  }, [apiUrl, token, sessionId, config.playerCount])

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
      }
    } catch (error) {
      console.error('Failed to remove mock players:', error)
    } finally {
      setIsLoading(false)
    }
  }, [apiUrl, token, sessionId])

  const statusText = useMemo(() => {
    if (!status) return 'Loading...'
    const speakingCount = status.speakingNow?.length || 0
    return `${status.activeMockCount} active, ${speakingCount} speaking`
  }, [status])

  const messageRateText = useMemo(() => {
    if (!status?.messagesSentLastMinuteByType) {
      return 'Messages/min: IC 0, OOC 0, Whisper 0'
    }

    const byType = status.messagesSentLastMinuteByType
    return `Messages/min: IC ${byType.IC}, OOC ${byType.OOC}, Whisper ${byType.WHISPER}`
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
            <input
              type="range"
              min={String(playerBounds.min)}
              max={String(playerBounds.max)}
              value={playerCount}
              onChange={handlePlayerCountChange}
              onMouseUp={handlePlayerCountCommit}
              onTouchEnd={handlePlayerCountCommit}
              className="mock-testing-panel__slider"
              disabled={isLoading}
            />
            <span className="mock-testing-panel__value">{playerCount}</span>
            <button
              className="mock-testing-panel__icon-button"
              onClick={handleReroll}
              disabled={isLoading}
              title="Reroll with current count"
              aria-label="Reroll mock players"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                refresh
              </span>
            </button>
          </div>
        </div>

        {/* Simulator Toggles */}
        <div className="mock-testing-panel__row">
          <label className="mock-testing-panel__label">Speaking</label>
          <div className="mock-testing-panel__toggle-group">
            <button
              className={`mock-testing-panel__segment-btn ${
                config.speakingSimulatorEnabled ? 'is-active' : ''
              }`}
              onClick={() => updateConfig({ speakingSimulatorEnabled: true })}
              disabled={isLoading || config.speakingSimulatorEnabled}
            >
              ON
            </button>
            <button
              className={`mock-testing-panel__segment-btn ${
                !config.speakingSimulatorEnabled ? 'is-active' : ''
              }`}
              onClick={() => updateConfig({ speakingSimulatorEnabled: false })}
              disabled={isLoading || !config.speakingSimulatorEnabled}
            >
              OFF
            </button>
          </div>
        </div>

        <div className="mock-testing-panel__row">
          <label className="mock-testing-panel__label">Chat</label>
          <div className="mock-testing-panel__toggle-group">
            <button
              className={`mock-testing-panel__segment-btn ${
                config.chatSimulatorEnabled ? 'is-active' : ''
              }`}
              onClick={() => updateConfig({ chatSimulatorEnabled: true })}
              disabled={isLoading || config.chatSimulatorEnabled}
            >
              ON
            </button>
            <button
              className={`mock-testing-panel__segment-btn ${
                !config.chatSimulatorEnabled ? 'is-active' : ''
              }`}
              onClick={() => updateConfig({ chatSimulatorEnabled: false })}
              disabled={isLoading || !config.chatSimulatorEnabled}
            >
              OFF
            </button>
          </div>
        </div>

        <div className="mock-testing-panel__row">
          <label className="mock-testing-panel__label">Disconnect</label>
          <div className="mock-testing-panel__toggle-group">
            <button
              className={`mock-testing-panel__segment-btn ${
                config.disconnectSimulatorEnabled ? 'is-active' : ''
              }`}
              onClick={() => updateConfig({ disconnectSimulatorEnabled: true })}
              disabled={isLoading || config.disconnectSimulatorEnabled}
            >
              ON
            </button>
            <button
              className={`mock-testing-panel__segment-btn ${
                !config.disconnectSimulatorEnabled ? 'is-active' : ''
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
            className="mock-testing-panel__action-button"
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
