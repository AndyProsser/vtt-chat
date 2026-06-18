import { memo } from 'react'
import type { UUID } from '@shared'
import { STATUS_PILL_ICONS, STATUS_PILL_LABELS } from '@/constants/voiceGroupStatus.constants'
import { PresenceIndicator } from './PresenceIndicator'
import { MicMutedIndicator } from './MicMutedIndicator'
import { useIsUserMuted } from '@/hooks/useIsUserMuted'
import { ProfileDeviceSessionsLeaf } from './ProfileDeviceSessionsLeaf'

export interface GroupMemberProfileCardParticipant {
  userId: UUID
  username: string
  avatarUrl?: string | null
  characterName?: string | null
  playerName?: string | null
  roleLabel?: string
  distanceLabel?: string
  condition?: string
  /** D&D status conditions synced from extension (e.g. "Poisoned", "Stunned"). Separate from DM audio conditions. */
  characterConditions?: string[]
}

interface GroupMemberProfileCardProps {
  /**
   * Per-user presence wiring. Mute and presence-dot leaves subscribe
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
}

function getDisplayName(member: GroupMemberProfileCardParticipant): string {
  return member.characterName || member.username || member.playerName || 'Player'
}

interface ProfileMutedStatusPillProps {
  sessionId: UUID
  userId: UUID
  isSelf: boolean
}

const ProfileMutedStatusPill = memo(function ProfileMutedStatusPill({
  sessionId,
  userId,
  isSelf,
}: ProfileMutedStatusPillProps) {
  const isMuted = useIsUserMuted(sessionId, userId, isSelf)

  if (!isMuted) {
    return null
  }

  return (
    <span className="room-selector-status-pill muted">
      <span className="material-symbols-outlined" aria-hidden="true">
        {STATUS_PILL_ICONS.muted}
      </span>
      {STATUS_PILL_LABELS.muted}
    </span>
  )
})

export function GroupMemberProfileCard({
  sessionId,
  isSelf = false,
  member,
  metaLine,
  statEntries,
  environmentName,
  activeTakeover = false,
}: GroupMemberProfileCardProps) {
  const displayName = getDisplayName(member)

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
      <div className="room-selector-profile__avatar-col">
        <div className="room-selector-profile__avatar" aria-hidden="true">
          {avatarVisual}
        </div>
        <ProfileDeviceSessionsLeaf sessionId={sessionId} userId={member.userId} />
      </div>

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
          {member.characterConditions && member.characterConditions.length > 0
            ? member.characterConditions.map((cond) => (
                <span key={cond} className="room-selector-status-pill character-condition">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    emergency
                  </span>
                  {cond}
                </span>
              ))
            : null}
          <ProfileMutedStatusPill sessionId={sessionId} userId={member.userId} isSelf={isSelf} />
        </div>
      </div>
    </div>
  )
}
