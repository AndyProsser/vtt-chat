import { STATUS_PILL_ICONS, STATUS_PILL_LABELS } from '@/constants/voiceGroupStatus.constants'
import type { SessionPresence } from '@/types/room'
import { ParticipantDeviceList } from './ParticipantDeviceList'

export interface GroupMemberProfileCardParticipant {
  userId: string
  username: string
  avatarUrl?: string | null
  characterName?: string | null
  playerName?: string | null
  roleLabel?: string
  ghost?: boolean
  isMuted?: boolean
  isSpeaking?: boolean
  distanceLabel?: string
  condition?: string
}

interface GroupMemberProfileCardProps {
  member: GroupMemberProfileCardParticipant
  metaLine: string
  statEntries: Array<[string, unknown]>
  environmentName: string
  presenceLabel: string
  presenceDotState: 'online' | 'offline'
  presenceIconName?: string
  activeTakeover?: boolean
  deviceSessions?: NonNullable<SessionPresence['deviceSessions']>
}

function getDisplayName(member: GroupMemberProfileCardParticipant): string {
  return member.characterName || member.username || member.playerName || 'Player'
}

export function GroupMemberProfileCard({
  member,
  metaLine,
  statEntries,
  environmentName,
  presenceLabel,
  presenceDotState,
  presenceIconName,
  activeTakeover = false,
  deviceSessions,
}: GroupMemberProfileCardProps) {
  const displayName = getDisplayName(member)
  const isMuted = Boolean(member.isMuted)

  return (
    <div className="room-selector-profile">
      {deviceSessions ? (
        <div className="room-selector-profile__avatar-col">
          <div className="room-selector-profile__avatar" aria-hidden="true">
            {member.avatarUrl ? (
              <img src={member.avatarUrl} alt="" />
            ) : (
              displayName.charAt(0).toUpperCase()
            )}
            {isMuted ? (
              <span className="room-selector-profile__avatar-muted-badge">
                <span className="material-symbols-outlined" aria-hidden="true">
                  mic_off
                </span>
              </span>
            ) : null}
          </div>
          <ParticipantDeviceList deviceSessions={deviceSessions} />
        </div>
      ) : (
        <div className="room-selector-profile__avatar" aria-hidden="true">
          {member.avatarUrl ? (
            <img src={member.avatarUrl} alt="" />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
          {isMuted ? (
            <span className="room-selector-profile__avatar-muted-badge">
              <span className="material-symbols-outlined" aria-hidden="true">
                mic_off
              </span>
            </span>
          ) : null}
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
          <span
            className="room-selector-presence-dot"
            data-state={presenceDotState}
            role="status"
            aria-label={presenceLabel}
          >
            <span className="room-selector-presence-dot__inner" aria-hidden="true" />
          </span>
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
          {member.ghost ? (
            <span className="room-selector-status-pill ghost">
              <span className="material-symbols-outlined" aria-hidden="true">
                visibility_off
              </span>
              Ghost Mode
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
