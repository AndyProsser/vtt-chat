/**
 * SpeakingIndicator
 *
 * Leaf component that visualises the "is this user currently speaking?" bit.
 *
 * Why this exists:
 *   The speaking bit toggles many times per minute (WS presence + LiveKit VAD).
 *   Threading it through the participant data shape causes every parent memo
 *   (LeftRailPanel.groupPanelRooms → GroupsPanel → RoomGroupCard →
 *   GroupMemberList → GroupMemberItem → AvatarOverlay) to rebuild new object
 *   references each time anyone speaks. Even with memo comparators the
 *   Radix Tooltip/Popover subtrees still rebuild — which is the source of
 *   the long-session memory growth.
 *
 * Design:
 *   - This component subscribes ONLY to the per-user speaking bits using
 *     primitive selectors. Zustand uses Object.is for primitives, so this
 *     component re-renders ONLY when *this* user's speaking bit flips.
 *   - All "expensive" props (userId, sessionId, isMuted, roomType, isSelf)
 *     are stable — they change only on DM actions or membership changes,
 *     never on speaking flips.
 *   - Render output is a single <span> overlay (or null). No props leak
 *     to parents — parents do not re-render when speaking changes.
 */

import { PresenceState, RoomType, type UUID } from '@shared'
import { useStore } from '@/state/store'
import { useIsUserMuted } from '@/hooks/useIsUserMuted'
import { getUserDMOverride } from '@/utils/audioOverrides'

interface SpeakingIndicatorProps {
  sessionId: UUID
  userId: UUID
  /** True iff this card represents the local user. */
  isSelf: boolean
  /** Room type — speaking is suppressed in PRIVATE (whisper) rooms. */
  roomType: RoomType
}

export function SpeakingIndicator({ sessionId, userId, isSelf, roomType }: SpeakingIndicatorProps) {
  // For self: full mute check (own + DM + device). Re-renders only on flip.
  const isMuted = useIsUserMuted(sessionId, userId, isSelf)

  // For remote users, ownMuted from server can be stale (race between the
  // "go live" UI update and the async unmute API broadcast). Only the DM
  // override is authoritative enough to suppress a speaking ring — if someone
  // is actively speaking in LiveKit, their ownMuted server state is by
  // definition stale. Reads a single primitive; same Object.is guarantee.
  const dmMuted = useStore((state) => Boolean(getUserDMOverride(state.dmOverrides, userId, 'MUTE')))

  // Per-user speaking bits — primitive boolean selectors. These are the only
  // store subscriptions that flip at speaking-rate. Object.is equality means
  // this component re-renders only when its own user's bit changes.
  const isWsSpeaking = useStore((state) =>
    Boolean(state.presenceSpeakingBySession[sessionId]?.[userId])
  )
  const isLkSpeaking = useStore((state) =>
    Boolean(state.presenceLkSpeakingBySession[sessionId]?.[userId])
  )

  // Self path: LiveKit's activeSpeakers does not include the local publisher,
  // so we read the local device VAD instead.
  const deviceSpeaking = useStore((state) => (isSelf ? state.device.isSpeaking : false))

  // AWAY detection: IDLE presence state means the player has gone away.
  // Ring colour switches to yellow to signal "speaking but not fully present".
  const isAway = useStore(
    (state) => !isSelf && state.sessionPresence[sessionId]?.[userId]?.state === PresenceState.IDLE
  )

  if (roomType === RoomType.PRIVATE) return null
  // Self: suppress ring when mic is off or DM-muted — full isMuted check.
  // Remote: only suppress for DM overrides; ownMuted can lag behind the actual
  // state when a player goes live after a page refresh (async API round-trip).
  if (isSelf ? isMuted : dmMuted) return null

  const speaking = isSelf ? deviceSpeaking : isWsSpeaking || isLkSpeaking
  if (!speaking) return null

  const cls = `avatar-glyph__speaking-ring${isAway ? ' avatar-glyph__speaking-ring--away' : ''}`
  return <span className={cls} aria-hidden="true" />
}
