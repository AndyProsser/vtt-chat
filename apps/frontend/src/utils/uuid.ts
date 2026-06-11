/**
 * Generates a UUID-like identifier with graceful fallback when Web Crypto
 * randomUUID is unavailable (older browsers/webviews).
 */
export function generateClientId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch {
      // Fallback for environments where the API exists but is not usable.
    }
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
