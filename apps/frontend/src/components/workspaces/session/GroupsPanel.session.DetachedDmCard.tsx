import { PresenceState } from '@shared'
import type { RoomUser } from '@/types/room'

interface DetachedDmCardProps {
  member: RoomUser
  voiceTargetRoomName: string | null
}

/** Shows the DM's own card detached from any group row when the DM is broadcasting or in cooldown. */
export function DetachedDmCard({ member, voiceTargetRoomName }: DetachedDmCardProps) {
  const isOffline =
    member.presenceState === PresenceState.OFFLINE || member.presenceState === PresenceState.IDLE
  return (
    <article className="session-groups-dm-detached" data-ui-component="SessionGroupsDetachedDM">
      <div className="session-groups-dm-detached__header">Dungeon Master</div>
      <div className="session-groups-dm-detached__member">
        <span
          className={`session-groups-member-card__avatar session-groups-member-card__avatar--${isOffline ? 'offline' : 'online'}`}
          aria-hidden="true"
        >
          {member.avatarUrl ? (
            <img src={member.avatarUrl} alt="" />
          ) : (
            (member.characterName || member.username || 'D').charAt(0).toUpperCase()
          )}
        </span>
        <div className="session-groups-member-card__body">
          <div className="session-groups-member-card__info">
            <span className="session-groups-member-card__char-name">
              {member.characterName || member.username}
            </span>
            {(member.playerName || member.username) !==
            (member.characterName || member.username) ? (
              <span className="session-groups-member-card__player-name">
                {member.playerName || member.username}
              </span>
            ) : null}
          </div>
          <div className="session-groups-member-card__aside">
            <span className="session-groups-member-card__role-pill session-groups-member-card__role-pill--dm">
              DM
            </span>
          </div>
        </div>
      </div>
      <div className="session-groups-dm-detached__footer">
        <span className="session-groups-dm-detached__target">
          Voice target: <strong>{voiceTargetRoomName || 'Main'}</strong>
        </span>
      </div>
    </article>
  )
}
