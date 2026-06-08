/**
 * useIsUserMuted
 *
 * Shared hook that resolves the combined "is this user muted right now?" bit
 * by subscribing to all the bits that contribute to it:
 *   - own user mute state (`userMuteState[sessionId][userId]`)
 *   - any active DM mute override (`dmOverrides[userId]` of type MUTE)
 *   - for the local user only: device mic + PTT gate
 *
 * Selectors are all primitive booleans (Object.is equality), so the caller
 * re-renders only when the combined mute state for THIS user flips.
 *
 * Used by MicMutedIndicator (rendering) and PlayerContextMenu (toggle UI).
 */
import { useStore } from '@/state/store'
import { getUserDMOverride } from '@/utils/audioOverrides'
import type { UUID } from '@shared'

export function useIsUserMuted(sessionId: UUID, userId: UUID, isSelf: boolean): boolean {
  const ownMuted = useStore((state) => Boolean(state.userMuteState[sessionId]?.[userId]))

  const dmMuted = useStore((state) => Boolean(getUserDMOverride(state.dmOverrides, userId, 'MUTE')))

  const selfLocallyMuted = useStore((state) => {
    if (!isSelf) return false
    const device = state.device
    // Before audio is initialized (device.enabled = false), device.microphoneOn
    // is false by default. Gate on device.enabled so the avatar muted badge
    // (MicMutedIndicator) doesn't appear before the user has clicked Go Live.
    // ModeStatusPill handles the "not live" case separately via device.enabled.
    if (!device.enabled) return false
    return device.pttEnabled ? !state.pttActive : !device.microphoneOn
  })

  return ownMuted || dmMuted || (isSelf && selfLocallyMuted)
}
