/**
 * Root Store
 * Zustand store combining all slices (session, chat, notes, audio, room, metadata).
 * Reference: docs/architecture/EVENT-BUS.md
 */

import { create } from 'zustand'
import { logger } from '@/utils/logger'
import type { SessionSlice } from './sessionSlice'
import type { ChatSlice } from './chatSlice'
import type { NotesSlice } from './notesSlice'
import type { AudioSlice } from './audioSlice'
import type { RoomSlice } from './roomSlice'
import type { PresenceSlice } from './presenceSlice'
import type { MetadataSlice } from './metadataSlice'
import type { LiveKitSlice } from './livekitSlice'
import type { UISlice } from './uiSlice'

import { createSessionSlice } from './sessionSlice'
import { createChatSlice } from './chatSlice'
import { createNotesSlice } from './notesSlice'
import { createAudioSlice } from './audioSlice'
import { createRoomSlice } from './roomSlice'
import { createPresenceSlice } from './presenceSlice'
import { createMetadataSlice } from './metadataSlice'
import { createLiveKitSlice } from './livekitSlice'
import { createUISlice } from './uiSlice'

/**
 * Combined store type.
 */
export type Store = SessionSlice &
  ChatSlice &
  NotesSlice &
  AudioSlice &
  PresenceSlice &
  RoomSlice &
  MetadataSlice &
  UISlice &
  LiveKitSlice

/**
 * Root Zustand store.
 * All slices are combined here using Zustand's composition pattern.
 */
export const useStore = create<Store>()((...args) => ({
  ...createSessionSlice(...args),
  ...createChatSlice(...args),
  ...createNotesSlice(...args),
  ...createAudioSlice(...args),
  ...createPresenceSlice(...args),
  ...createRoomSlice(...args),
  ...createMetadataSlice(...args),
  ...createUISlice(...args),
  ...createLiveKitSlice(...args),
}))

if (typeof window !== 'undefined') {
  let prevState = useStore.getState()

  useStore.subscribe((nextState) => {
    const keys = new Set([...Object.keys(prevState), ...Object.keys(nextState)])
    const changedKeys: string[] = []

    for (const key of keys) {
      if (!Object.is((prevState as any)[key], (nextState as any)[key])) {
        changedKeys.push(key)
      }
    }

    if (changedKeys.length > 0) {
      logger.debug('store', 'State updated', {
        changedKeys,
      })
    }

    prevState = nextState
  })
}
