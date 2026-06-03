export const DISCONNECT_CASCADE_TIMERS_MS = {
  ghostEntryDelay: 5_000,
  // Total eviction window = ghostEntryDelay + presenceTtlRemoval.
  // Must exceed the longest realistic mobile reconnect (cellular handover: 15-20s).
  // At 45s the full window is 50s, safely above handover times. Do not reduce
  // below 30s or mobile players will be evicted before they can reconnect.
  presenceTtlRemoval: 45_000,
  everyoneLeavesAutoStop: 60_000,
  cleanupTriggerDelay: 20 * 60_000,
} as const

export type DisconnectCascadeTimerKey = keyof typeof DISCONNECT_CASCADE_TIMERS_MS
