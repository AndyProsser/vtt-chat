import { useCallback, useEffect, useMemo, useState } from 'react'
import type { UUID } from '@shared'
import './MockPlayerControlPanel.css'

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
  const [playerCount, setPlayerCount] = useState(8)
  const [config, setConfig] = useState<MockSimulationConfig>({
    speakingSimulatorEnabled: true,
    chatSimulatorEnabled: false,
    disconnectSimulatorEnabled: false,
    playerCount: 8,
  })
  const [status, setStatus] = useState<MockSimulationStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Poll for status every 2s
  useEffect(() => {
    const pollStatus = async () => {
      try {
        const response = await fetch(
          `${apiUrl}/api/v1/dev/mock-players/simulation/status/${sessionId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        )
        if (response.ok) {
          const data = await response.json()
          setStatus(data)
          setConfig(data.config)
          setPlayerCount(data.config.playerCount)
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
        const response = await fetch(`${apiUrl}/api/v1/dev/mock-players/simulation/settings`, {
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

  const handlePlayerCountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newCount = parseInt(e.target.value, 10)
    setPlayerCount(newCount)
  }, [])

  const handlePlayerCountCommit = useCallback(async () => {
    if (playerCount === config.playerCount) return

    setIsLoading(true)
    try {
      const response = await fetch(`${apiUrl}/api/v1/dev/mock-players/reroll`, {
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
      const response = await fetch(`${apiUrl}/api/v1/dev/mock-players/reroll`, {
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
      const response = await fetch(`${apiUrl}/api/v1/dev/mock-players/disconnect-all`, {
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
    return `${status.activeMockCount} active mocks, ${speakingCount} speaking`
  }, [status])

  return (
    <div className="mock-player-control-panel" data-mock-control-panel>
      <div className="mock-player-control-panel__content">
        {/* Player Count Slider */}
        <div className="mock-player-control-panel__row">
          <label className="mock-player-control-panel__label">Player Count:</label>
          <input
            type="range"
            min="1"
            max="20"
            value={playerCount}
            onChange={handlePlayerCountChange}
            onMouseUp={handlePlayerCountCommit}
            onTouchEnd={handlePlayerCountCommit}
            className="mock-player-control-panel__slider"
            disabled={isLoading}
          />
          <span className="mock-player-control-panel__count">{playerCount}</span>
          <button
            className="mock-player-control-panel__button mock-player-control-panel__button--icon"
            onClick={handleReroll}
            disabled={isLoading}
            title="Reroll with same player count"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              refresh
            </span>
          </button>
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
