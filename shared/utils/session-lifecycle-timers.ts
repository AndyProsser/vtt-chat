export const DISCONNECT_CASCADE_TIMERS_MS = {
  ghostEntryDelay: 5_000,
  presenceTtlRemoval: 60_000,
  everyoneLeavesAutoStop: 60_000,
  cleanupTriggerDelay: 20 * 60_000,
} as const

export type DisconnectCascadeTimerKey = keyof typeof DISCONNECT_CASCADE_TIMERS_MS
