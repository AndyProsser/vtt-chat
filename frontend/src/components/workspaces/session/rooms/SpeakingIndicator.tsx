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

import { RoomType, type UUID } from '@shared'
import { useStore } from '@/state/store'
import { useIsUserMuted } from '@/hooks/useIsUserMuted'

interface SpeakingIndicatorProps {
  sessionId: UUID
  userId: UUID
  /** True iff this card represents the local user. */
  isSelf: boolean
  /** Room type — speaking is suppressed in PRIVATE (whisper) rooms. */
  roomType: RoomType
}

export function SpeakingIndicator({ sessionId, userId, isSelf, roomType }: SpeakingIndicatorProps) {
  // Mute is subscribed via the shared hook (own + DM override + self device).
  // Re-renders only when THIS user's combined mute bit flips.
  const isMuted = useIsUserMuted(sessionId, userId, isSelf)

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

  if (roomType === RoomType.PRIVATE) return null
  if (isMuted) return null

  const speaking = isSelf ? deviceSpeaking : isWsSpeaking || isLkSpeaking
  if (!speaking) return null

  return <span className="avatar-glyph__speaking-ring" aria-hidden="true" />
}
