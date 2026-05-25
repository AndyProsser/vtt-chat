/**
 * Root Store
 * Zustand store combining all slices (session, chat, notes, audio, room, metadata).
 * Reference: docs/architecture/EVENT-BUS.md
 */

import { create } from 'zustand'
import { logger } from '@/utils/logger'
import { bumpLoopCounter, isLoopDiagnosticsEnabled } from '@/utils/loopDiagnostics'
import type { SessionSlice } from './sessionSlice'
import type { ChatSlice } from './chatSlice'
import type { GreenroomSlice } from './greenroomSlice'
import type { NotesSlice } from './notesSlice'
import type { AudioSlice } from './audioSlice'
import type { RoomSlice } from './roomSlice'
import type { PresenceSlice } from './presenceSlice'
import type { MetadataSlice } from './metadataSlice'
import type { LiveKitSlice } from './livekitSlice'
import type { UISlice } from './uiSlice'
import type { UserMuteSlice } from './userMuteSlice'
import type { CampaignGroupsSlice } from './campaignGroupsSlice'
import type { SessionGroupsSlice } from './sessionGroupsSlice'
import type { GroupPanelUISlice } from './groupPanelUISlice'
import type { MockSimulationSlice } from './mockSimulationSlice'

import { createSessionSlice } from './sessionSlice'
import { createChatSlice } from './chatSlice'
import { createGreenroomSlice } from './greenroomSlice'
import { createNotesSlice } from './notesSlice'
import { createAudioSlice } from './audioSlice'
import { createRoomSlice } from './roomSlice'
import { createPresenceSlice } from './presenceSlice'
import { createMetadataSlice } from './metadataSlice'
import { createLiveKitSlice } from './livekitSlice'
import { createUISlice } from './uiSlice'
import { createUserMuteSlice } from './userMuteSlice'
import { createCampaignGroupsSlice } from './campaignGroupsSlice'
import { createSessionGroupsSlice } from './sessionGroupsSlice'
import { createGroupPanelUISlice } from './groupPanelUISlice'
import { createMockSimulationSlice } from './mockSimulationSlice'

declare global {
  interface Window {
    __VTT_DEBUG_STORE__?: boolean
    __VTT_DEBUG_CHURN__?: boolean
  }
}

interface StoreChurnSnapshot {
  totalSessionMessages: number
  totalOutgoingQueueMessages: number
  totalTypingIndicators: number
  totalWsSpeakers: number
  totalLiveKitSpeakers: number
  totalRoomMembers: number
  totalLiveKitConnections: number
}

function countRecordKeys<T>(record: Record<string, T>): number {
  let total = 0
  for (const _key in record) {
    total += 1
  }
  return total
}

function collectChurnSnapshot(state: Store): StoreChurnSnapshot {
  let totalSessionMessages = 0
  for (const _sessionId in state.messages) {
    totalSessionMessages += countRecordKeys(state.messages[_sessionId])
  }

  let totalOutgoingQueueMessages = 0
  for (const _sessionId in state.outgoingQueue) {
    totalOutgoingQueueMessages += state.outgoingQueue[_sessionId]?.length || 0
  }

  let totalTypingIndicators = 0
  for (const _sessionId in state.presenceTypingBySession) {
    totalTypingIndicators += state.presenceTypingBySession[_sessionId]?.length || 0
  }

  let totalWsSpeakers = 0
  for (const _sessionId in state.presenceSpeakingBySession) {
    totalWsSpeakers += countRecordKeys(state.presenceSpeakingBySession[_sessionId])
  }

  let totalLiveKitSpeakers = 0
  for (const _sessionId in state.presenceLkSpeakingBySession) {
    totalLiveKitSpeakers += countRecordKeys(state.presenceLkSpeakingBySession[_sessionId])
  }

  let totalRoomMembers = 0
  for (const _roomId in state.roomMembers) {
    totalRoomMembers += state.roomMembers[_roomId]?.length || 0
  }

  return {
    totalSessionMessages,
    totalOutgoingQueueMessages,
    totalTypingIndicators,
    totalWsSpeakers,
    totalLiveKitSpeakers,
    totalRoomMembers,
    totalLiveKitConnections: countRecordKeys(state.livekitConnections),
  }
}

/**
 * Combined store type.
 */
export type Store = SessionSlice &
  ChatSlice &
  GreenroomSlice &
  NotesSlice &
  AudioSlice &
  PresenceSlice &
  RoomSlice &
  MetadataSlice &
  UISlice &
  LiveKitSlice &
  UserMuteSlice &
  CampaignGroupsSlice &
  SessionGroupsSlice &
  GroupPanelUISlice &
  MockSimulationSlice

/**
 * Root Zustand store.
 * All slices are combined here using Zustand's composition pattern.
 */
export const useStore = create<Store>()((...args) => ({
  ...createSessionSlice(...args),
  ...createChatSlice(...args),
  ...createGreenroomSlice(...args),
  ...createNotesSlice(...args),
  ...createAudioSlice(...args),
  ...createPresenceSlice(...args),
  ...createRoomSlice(...args),
  ...createMetadataSlice(...args),
  ...createUISlice(...args),
  ...createLiveKitSlice(...args),
  ...createUserMuteSlice(...args),
  ...createCampaignGroupsSlice(...args),
  ...createSessionGroupsSlice(...args),
  ...createGroupPanelUISlice(...args),
  ...createMockSimulationSlice(...args),
}))

if (typeof window !== 'undefined') {
  const runtimeDebugEnabled =
    typeof window !== 'undefined' &&
    (window as Window & { __VTT_DEBUG_STORE__?: boolean }).__VTT_DEBUG_STORE__ === true
  const runtimeChurnEnabled =
    typeof window !== 'undefined' &&
    (window as Window & { __VTT_DEBUG_CHURN__?: boolean }).__VTT_DEBUG_CHURN__ === true
  const envDebugEnabled = import.meta.env.VITE_DEBUG_STORE_UPDATES === '1'
  const envChurnEnabled = import.meta.env.VITE_DEBUG_CHURN_METRICS === '1'
  const loopDiagEnabled = isLoopDiagnosticsEnabled()
  const churnDiagEnabled = runtimeChurnEnabled || envChurnEnabled

  if (runtimeDebugEnabled || envDebugEnabled || loopDiagEnabled || churnDiagEnabled) {
    // Use a simpler subscription that only tracks specific key changes
    // to avoid triggering Zustand's internal getSnapshot caching issues
    let lastUpdateTime = 0
    const MIN_UPDATE_INTERVAL = 250 // Throttle updates to prevent excessive logging
    let lastChurnLogTime = 0
    const CHURN_LOG_INTERVAL = 2000
    let previousChurnSnapshot = collectChurnSnapshot(useStore.getState())

    useStore.subscribe((nextState) => {
      const now = Date.now()
      if (now - lastUpdateTime < MIN_UPDATE_INTERVAL) {
        return
      }
      lastUpdateTime = now

      if (loopDiagEnabled) {
        bumpLoopCounter('store.update.total')
      }

      if (runtimeDebugEnabled || envDebugEnabled) {
        logger.debug('store', 'State updated (throttled)')
      }

      if (churnDiagEnabled && now - lastChurnLogTime >= CHURN_LOG_INTERVAL) {
        const nextSnapshot = collectChurnSnapshot(nextState)
        logger.debug('store.churn', 'Store churn snapshot', {
          ...nextSnapshot,
          deltaSessionMessages:
            nextSnapshot.totalSessionMessages - previousChurnSnapshot.totalSessionMessages,
          deltaOutgoingQueueMessages:
            nextSnapshot.totalOutgoingQueueMessages -
            previousChurnSnapshot.totalOutgoingQueueMessages,
          deltaTypingIndicators:
            nextSnapshot.totalTypingIndicators - previousChurnSnapshot.totalTypingIndicators,
          deltaWsSpeakers: nextSnapshot.totalWsSpeakers - previousChurnSnapshot.totalWsSpeakers,
          deltaLiveKitSpeakers:
            nextSnapshot.totalLiveKitSpeakers - previousChurnSnapshot.totalLiveKitSpeakers,
          deltaRoomMembers: nextSnapshot.totalRoomMembers - previousChurnSnapshot.totalRoomMembers,
          deltaLiveKitConnections:
            nextSnapshot.totalLiveKitConnections - previousChurnSnapshot.totalLiveKitConnections,
        })
        previousChurnSnapshot = nextSnapshot
        lastChurnLogTime = now
      }
    })
  }
}
