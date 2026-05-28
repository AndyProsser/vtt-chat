import type { UUID } from '@shared'
import { STATUS_PILL_ICONS, STATUS_PILL_LABELS } from '@/constants/voiceGroupStatus.constants'
import type { SessionPresence } from '@/types/room'
import { ParticipantDeviceList } from './ParticipantDeviceList'
import { PresenceIndicator } from './PresenceIndicator'
import { MicMutedIndicator } from './MicMutedIndicator'
import { useIsUserMuted } from '@/hooks/useIsUserMuted'
import { useStore } from '@/state/store'

export interface GroupMemberProfileCardParticipant {
  userId: UUID
  username: string
  avatarUrl?: string | null
  characterName?: string | null
  playerName?: string | null
  roleLabel?: string
  distanceLabel?: string
  condition?: string
}

interface GroupMemberProfileCardProps {
  /**
   * Per-user presence wiring. Mute, ghost and presence-dot leaves subscribe
   * directly to per-user store bits using these identifiers — so a mute or
   * presence flip never re-renders the whole profile card or its parent.
   */
  sessionId: UUID
  isSelf?: boolean
  member: GroupMemberProfileCardParticipant
  metaLine: string
  statEntries: Array<[string, unknown]>
  environmentName: string
  presenceIconName?: string
  activeTakeover?: boolean
  deviceSessions?: NonNullable<SessionPresence['deviceSessions']>
}

function getDisplayName(member: GroupMemberProfileCardParticipant): string {
  return member.characterName || member.username || member.playerName || 'Player'
}

export function GroupMemberProfileCard({
  sessionId,
  isSelf = false,
  member,
  metaLine,
  statEntries,
  environmentName,
  activeTakeover = false,
  deviceSessions,
}: GroupMemberProfileCardProps) {
  const displayName = getDisplayName(member)

  // Subscribe to mute and ghost bits locally for the status pills at the
  // bottom of the card. These are primitive boolean selectors so the card
  // re-renders only when THIS user's mute or ghost bit flips, never on any
  // other user's changes.
  const isMuted = useIsUserMuted(sessionId, member.userId, isSelf)
  const isGhost = useStore((state) =>
    Boolean(state.sessionPresence[sessionId]?.[member.userId]?.ghost)
  )

  const avatarVisual = (
    <>
      {member.avatarUrl ? (
        <img src={member.avatarUrl} alt="" />
      ) : (
        displayName.charAt(0).toUpperCase()
      )}
      <MicMutedIndicator
        sessionId={sessionId}
        userId={member.userId}
        isSelf={isSelf}
        variant="profile"
      />
    </>
  )

  return (
    <div className="room-selector-profile">
      {deviceSessions ? (
        <div className="room-selector-profile__avatar-col">
          <div className="room-selector-profile__avatar" aria-hidden="true">
            {avatarVisual}
          </div>
          <ParticipantDeviceList deviceSessions={deviceSessions} />
        </div>
      ) : (
        <div className="room-selector-profile__avatar" aria-hidden="true">
          {avatarVisual}
        </div>
      )}

      <div className="room-selector-profile__meta">
        <div className="room-selector-profile__title-row">
          <span className="room-selector-profile__name-wrap">
            <strong>{displayName}</strong>
            <span
              className={`room-selector-status-pill role compact ${activeTakeover ? 'takeover-active' : ''}`}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {STATUS_PILL_ICONS.role}
              </span>
              {member.roleLabel || 'PLAYER'}
            </span>
          </span>
          <PresenceIndicator sessionId={sessionId} userId={member.userId} />
        </div>
        {member.playerName && member.playerName !== displayName ? (
          <span className="room-selector-profile__player-name">{member.playerName}</span>
        ) : null}
        {metaLine ? <p>{metaLine}</p> : null}
        {statEntries.length > 0 ? (
          <div className="room-selector-profile__stats">
            {statEntries.map(([key, value]) => (
              <span
                key={key}
                className="room-selector-profile__stat"
                aria-label={`${key} ${String(value)}`}
              >
                <strong className="room-selector-profile__stat-value">{String(value)}</strong>
                <span className="room-selector-profile__stat-label">{key}</span>
              </span>
            ))}
          </div>
        ) : null}
        <div className="room-selector-profile__status-pills">
          <span className="room-selector-status-pill environment">
            <span className="material-symbols-outlined" aria-hidden="true">
              {STATUS_PILL_ICONS.environment}
            </span>
            Env: {environmentName}
          </span>
          {member.distanceLabel !== undefined ? (
            <span className="room-selector-status-pill distance">
              <span className="material-symbols-outlined" aria-hidden="true">
                {STATUS_PILL_ICONS.distance}
              </span>
              Distance: {member.distanceLabel || STATUS_PILL_LABELS.distanceDefault}
            </span>
          ) : null}
          {member.condition !== undefined ? (
            <span className="room-selector-status-pill condition">
              <span className="material-symbols-outlined" aria-hidden="true">
                {STATUS_PILL_ICONS.condition}
              </span>
              Condition: {member.condition || STATUS_PILL_LABELS.conditionNone}
            </span>
          ) : null}
          {isMuted ? (
            <span className="room-selector-status-pill muted">
              <span className="material-symbols-outlined" aria-hidden="true">
                {STATUS_PILL_ICONS.muted}
              </span>
              {STATUS_PILL_LABELS.muted}
            </span>
          ) : null}
          {isGhost ? (
            <span className="room-selector-status-pill ghost">
              <span className="material-symbols-outlined" aria-hidden="true">
                visibility_off
              </span>
              Ghost Mode
            </span>
          ) : null}
        </div>
        {/* GhostIndicator mounted invisibly is unnecessary — we already subscribe
            to ghost above to render the pill. Avatar's ghost badge is on the
            AvatarOverlay tree, not here. */}
      </div>
    </div>
  )
}
