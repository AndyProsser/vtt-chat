/**
 * Root Store
 * Zustand store combining all slices (session, chat, notes, audio, room, metadata).
 * Reference: docs/architecture/EVENT-BUS.md
 */

import { create } from 'zustand'
import type { SessionSlice } from './sessionSlice'
import type { ChatSlice } from './chatSlice'
import type { NotesSlice } from './notesSlice'
import type { AudioSlice } from './audioSlice'
import type { RoomSlice } from './roomSlice'
import type { MetadataSlice } from './metadataSlice'
import type { CommandCenterSlice } from './commandCenterSlice'

import { createSessionSlice } from './sessionSlice'
import { createChatSlice } from './chatSlice'
import { createNotesSlice } from './notesSlice'
import { createAudioSlice } from './audioSlice'
import { createRoomSlice } from './roomSlice'
import { createMetadataSlice } from './metadataSlice'
import { createCommandCenterSlice } from './commandCenterSlice'

/**
 * Combined store type.
 */
export type Store = SessionSlice &
  ChatSlice &
  NotesSlice &
  AudioSlice &
  RoomSlice &
  MetadataSlice &
  CommandCenterSlice

/**
 * Root Zustand store.
 * All slices are combined here using Zustand's composition pattern.
 */
export const useStore = create<Store>()((...args) => ({
  ...createSessionSlice(...args),
  ...createChatSlice(...args),
  ...createNotesSlice(...args),
  ...createAudioSlice(...args),
  ...createRoomSlice(...args),
  ...createMetadataSlice(...args),
  ...createCommandCenterSlice(...args),
}))
