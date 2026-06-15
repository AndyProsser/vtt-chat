import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UUID } from '@shared'
import { Slider, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { useStore } from '@/state/store'
import type { MockSimulationConfig } from '@/types/mockSimulation'
import '@/styles/components/workspaces/session/dev/MockTestingPanel.css'
import { Icon } from '@/components/ui/Icon'

const DEFAULT_MOCK_CONFIG: MockSimulationConfig = {
  speakingSimulatorEnabled: true,
  chatSimulatorEnabled: false,
  disconnectSimulatorEnabled: false,
  multiDeviceSimulatorEnabled: false,
  playerCount: 8,
}

const DEFAULT_PLAYER_BOUNDS = { min: 1, max: 9 }

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
  const status = useStore((state) => state.mockSimulationStatusBySession[sessionId] || null)
  const isLoading = useStore((state) => state.mockSimulationLoadingBySession[sessionId] || false)
  const fetchMockSimulationStatus = useStore((state) => state.fetchMockSimulationStatus)
  const updateMockSimulationConfig = useStore((state) => state.updateMockSimulationConfig)
  const rerollMockSimulationPlayers = useStore((state) => state.rerollMockSimulationPlayers)
  const removeMockPlayers = useStore((state) => state.removeMockPlayers)
  const [playerCount, setPlayerCount] = useState(DEFAULT_MOCK_CONFIG.playerCount)
  const [messageRateHistory, setMessageRateHistory] = useState<number[]>([])
  const isPlayerCountDirtyRef = useRef(false)
  const lastTrendKeyRef = useRef<string | null>(null)
  const config = status?.config || DEFAULT_MOCK_CONFIG
  const playerBounds = status?.bounds || DEFAULT_PLAYER_BOUNDS

  useEffect(() => {
    void fetchMockSimulationStatus({ apiUrl, token, sessionId })
  }, [apiUrl, token, sessionId, fetchMockSimulationStatus])

  useEffect(() => {
    if (!status || isPlayerCountDirtyRef.current) {
      return
    }

    setPlayerCount(status.config.playerCount)
  }, [status])

  useEffect(() => {
    if (!status) {
      return
    }

    const byType = status.messagesSentLastMinuteByType
    const totalPerMinute = byType
      ? Number(byType.IC || 0) +
        Number(byType.OOC || 0) +
        Number(byType.WHISPER || 0) +
        Number(byType.DM || 0)
      : 0
    const trendKey = [
      status.uptime,
      totalPerMinute,
      byType?.IC || 0,
      byType?.OOC || 0,
      byType?.WHISPER || 0,
      byType?.DM || 0,
    ].join(':')

    if (lastTrendKeyRef.current === trendKey) {
      return
    }

    lastTrendKeyRef.current = trendKey
    setMessageRateHistory((prev) => [...prev.slice(-9), totalPerMinute])
  }, [status])

  const updateConfig = useCallback(
    async (newConfig: Partial<MockSimulationConfig>) => {
      await updateMockSimulationConfig({
        apiUrl,
        token,
        sessionId,
        config: newConfig,
      })
    },
    [apiUrl, token, sessionId, updateMockSimulationConfig]
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

    const updated = await rerollMockSimulationPlayers({
      apiUrl,
      token,
      sessionId,
      newPlayerCount: playerCount,
    })

    if (!updated) {
      isPlayerCountDirtyRef.current = false
      setPlayerCount(config.playerCount)
      return
    }

    isPlayerCountDirtyRef.current = false
    setPlayerCount(updated.config.playerCount)
  }, [apiUrl, token, sessionId, playerCount, config.playerCount, rerollMockSimulationPlayers])

  const handleReroll = useCallback(async () => {
    await rerollMockSimulationPlayers({
      apiUrl,
      token,
      sessionId,
      newPlayerCount: config.playerCount,
    })
  }, [apiUrl, token, sessionId, config.playerCount, rerollMockSimulationPlayers])

  const handleRemoveAll = useCallback(async () => {
    const removed = await removeMockPlayers({ apiUrl, token, sessionId })
    if (removed) {
      onClose?.()
    }
  }, [apiUrl, token, sessionId, removeMockPlayers, onClose])

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
              min={playerBounds.min}
              max={playerBounds.max}
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
                    <Icon name="refresh" />
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
          <Icon name="delete" />
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
            <Icon name="undo" />
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
