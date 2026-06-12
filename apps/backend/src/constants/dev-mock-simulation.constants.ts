// Prune inactive mock simulation runtimes to avoid process memory drift in
// long-lived development servers.
export const DEV_MOCK_RUNTIME_INACTIVE_TTL_MS = 30 * 60 * 1000

/**
 * Number of ticks a speaker set is held before cycling to new speakers.
 * Each tick is 1400ms, so 3 ticks ≈ 4.2 seconds of stable speaking state.
 * Increasing this value reduces PRESENCE:STATE_CHANGED event frequency,
 * which lowers frontend Zustand update rate and React re-render pressure
 * during long mock simulation runs.
 */
export const DEV_MOCK_SPEAKING_STABILITY_TICKS = 3
