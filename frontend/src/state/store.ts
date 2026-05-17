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

declare global {
  interface Window {
    __VTT_DEBUG_STORE__?: boolean
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
  UserMuteSlice

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
}))

if (typeof window !== 'undefined') {
  const runtimeDebugEnabled =
    typeof window !== 'undefined' &&
    (window as Window & { __VTT_DEBUG_STORE__?: boolean }).__VTT_DEBUG_STORE__ === true
  const envDebugEnabled = import.meta.env.VITE_DEBUG_STORE_UPDATES === '1'
  const loopDiagEnabled = isLoopDiagnosticsEnabled()

  if (runtimeDebugEnabled || envDebugEnabled || loopDiagEnabled) {
    // Use a simpler subscription that only tracks specific key changes
    // to avoid triggering Zustand's internal getSnapshot caching issues
    let lastUpdateTime = 0
    const MIN_UPDATE_INTERVAL = 250 // Throttle updates to prevent excessive logging

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
    })
  }
}
