import type { UUID } from '@shared'

export interface MockSimulationConfig {
  speakingSimulatorEnabled: boolean
  chatSimulatorEnabled: boolean
  disconnectSimulatorEnabled: boolean
  multiDeviceSimulatorEnabled?: boolean
  playerCount: number
}

export interface MockSimulationMessageRateByType {
  IC: number
  OOC: number
  WHISPER: number
  DM: number
}

export interface MockSimulationStatusResponse {
  sessionId: UUID
  config: MockSimulationConfig
  isRunning: boolean
  activeMockCount: number
  speakingNow: UUID[]
  uptime: number
  messagesSentLastMinuteByType?: MockSimulationMessageRateByType
  bounds?: { min: number; max: number }
}
