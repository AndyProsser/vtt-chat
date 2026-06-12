export const CHAT_GROUPING_STORAGE_KEY = 'vtt-chat:chat-grouping-window-ms'
export const DEFAULT_CHAT_GROUPING_WINDOW_MS = 5 * 60 * 1000
export const ALLOWED_CHAT_GROUPING_WINDOWS = new Set([
  0,
  2 * 60 * 1000,
  5 * 60 * 1000,
  10 * 60 * 1000,
])
export const LOBBY_CAMPAIGN_FOCUS_STORAGE_KEY = 'vtt-chat:lobby-campaign-focus-id'
export const LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY = 'vtt-chat:lobby-auto-enter-campaign-id'
export const LOBBY_NOTICE_STORAGE_KEY = 'vtt-chat:lobby-notice'
export const ACTIVE_SESSION_CONTEXT_STORAGE_KEY = 'vtt-chat:active-session-context'
export const MAX_POSTER_WIDTH_PX = 1024
export const DEFAULT_PLANNED_DURATION_MINUTES = 180
export const MAX_POSTER_DATA_URL_CHARS = 350_000
export const SESSION_BOOKEND_DEDUPE_WINDOW_MS = 10_000
export const SESSION_SUMMARY_TAG = 'session-summary'
export const SESSION_SUMMARY_TITLE = 'Session Summary'
export const WS_ERROR_TOAST_ID = 'workspaces:ws-error'
export const WS_AUTO_RETRY_WINDOW_MS = 30_000
export const WS_RESET_RECONNECT_UI_SUPPRESS_MS = 3_000
export const WORKSPACES_MEMORY_PRESSURE_TOAST_ID = 'workspaces:memory-pressure'
export const WORKSPACES_MEMORY_PRESSURE_THRESHOLD_BYTES = 1_000_000_000
export const WORKSPACES_MEMORY_PRESSURE_POLL_MS = 30_000
export const WORKSPACES_MEMORY_PRESSURE_RELOAD_GRACE_MS = 15_000
export const WORKSPACES_MEMORY_PRESSURE_RELOAD_COOLDOWN_MS = 5 * 60 * 1000
export const WORKSPACES_MEMORY_PRESSURE_RELOAD_STORAGE_KEY =
  'vtt-chat:memory-pressure-last-reload-at'
export const DEFAULT_GREENROOM_CACHE_TTL_MS = 60 * 60 * 1000
export const SESSION_BOOKEND_PREFIXES = [
  'Session Start:',
  'Session End:',
  '[Session Started]',
  '[Session Ended]',
  '[Session Paused]',
  '[Session Resumed]',
  '[Session Cooldown]',
] as const

export const SESSION_NOTE_PREFIX = 'Session Note:'
export const SESSION_RECAP_PREFIX = '[Last Session]'
export const CAMPAIGN_BRIEF_PREFIX = '[Campaign Brief]'
export const SESSION_SUMMARY_PREFIX = '[Session Summary]'

export const ROOM_ENVIRONMENT_PRESET_FALLBACKS: Record<
  string,
  { reverbSend: number; lowpassFreq: number; roomGain: number }
> = {
  default: { reverbSend: 0.3, lowpassFreq: 8000, roomGain: 0 },
  forest: { reverbSend: 0.42, lowpassFreq: 7600, roomGain: -1 },
  cave: { reverbSend: 0.62, lowpassFreq: 4200, roomGain: -2 },
  tavern: { reverbSend: 0.36, lowpassFreq: 6800, roomGain: -1 },
  city: { reverbSend: 0.28, lowpassFreq: 8200, roomGain: -0.5 },
  dungeon: { reverbSend: 0.54, lowpassFreq: 3600, roomGain: -2.5 },
  night: { reverbSend: 0.24, lowpassFreq: 9000, roomGain: -1.2 },
  storm: { reverbSend: 0.48, lowpassFreq: 5200, roomGain: -1.8 },
}
