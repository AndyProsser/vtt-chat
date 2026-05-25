// Prune inactive mock simulation runtimes to avoid process memory drift in
// long-lived development servers.
export const DEV_MOCK_RUNTIME_INACTIVE_TTL_MS = 30 * 60 * 1000
