export const CHAT_HISTORY_PAGE_SIZE = 20
export const TYPING_IDLE_TIMEOUT_MS = 2600
export const TYPING_INDICATOR_REFRESH_INTERVAL_MS = 1000
export const TYPING_INDICATOR_TTL_MS = 5000

// Ignore tiny typing-start TTL extensions to reduce high-frequency WS churn.
export const TYPING_RENEW_MIN_EXTENSION_MS = 1200

// Coalesce transient presence refreshes (especially mock chatter) when no
// material presence fields changed.
export const PRESENCE_TRANSIENT_REFRESH_INTERVAL_MS = 1200

// Bound in-memory chat cache for long-running sessions. Keep recent messages in
// memory while older history remains available through paged history endpoints.
export const CHAT_SESSION_CACHE_MAX_MESSAGES = 2200
export const CHAT_SESSION_CACHE_RETAIN_MESSAGES = 1800
