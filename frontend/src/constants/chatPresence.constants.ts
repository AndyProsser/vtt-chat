export const CHAT_HISTORY_PAGE_SIZE = 20
export const TYPING_IDLE_TIMEOUT_MS = 2600
export const TYPING_INDICATOR_REFRESH_INTERVAL_MS = 1000
export const TYPING_INDICATOR_TTL_MS = 5000

// Ignore tiny typing-start TTL extensions to reduce high-frequency WS churn.
export const TYPING_RENEW_MIN_EXTENSION_MS = 1200

// Coalesce transient presence refreshes (especially mock chatter) when no
// material presence fields changed.
export const PRESENCE_TRANSIENT_REFRESH_INTERVAL_MS = 1200

// Keep disconnected users briefly for UX continuity, then prune to prevent
// unbounded sessionPresence growth during long-running disconnect churn.
export const PRESENCE_OFFLINE_RETENTION_MS = 15 * 60 * 1000
export const PRESENCE_SESSION_MAX_ENTRIES = 400
export const PRESENCE_SESSION_RETAIN_ENTRIES = 320

// Bound in-memory chat cache for long-running sessions. Keep recent messages in
// memory while older history remains available through paged history endpoints.
// 10-20 messages are visible at once; 300 is a generous but bounded window.
// Pruning triggers at MAX and retains the most recent RETAIN messages.
export const CHAT_SESSION_CACHE_MAX_MESSAGES = 300
export const CHAT_SESSION_CACHE_RETAIN_MESSAGES = 250
export const GREENROOM_CACHE_MAX_MESSAGES = 300
export const GREENROOM_CACHE_RETAIN_MESSAGES = 250
