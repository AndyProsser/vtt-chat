import { memo } from 'react'
import type { MockPartyMember, MockPlayerStatus } from '@/types/campaignParty'
import { formatLastSeen } from '@/utils/campaignPartyMockData'
import { STATUS_LABELS, STATUS_SYMBOL } from './PartyPanel.helpers'

function PartyStatusBadge({ status }: { status: MockPlayerStatus }) {
  return (
    <span className={`party-status-badge party-status-badge--${status}`}>
      <span className="material-symbols-outlined party-status-badge__icon" aria-hidden="true">
        {STATUS_SYMBOL[status]}
      </span>
      {STATUS_LABELS[status]}
    </span>
  )
}

/**
 * PartyMemberCard — per-member row in the party rail.
 *
 * Wrapped in React.memo so that when only one member's status flips (HERE /
 * AWAY / NOT_HERE / OFFLINE), only that card re-renders. PartyPanel's
 * `mergeMembersPreservingReferences` keeps the MockPartyMember reference
 * stable for any member whose fields did not change, so the default shallow
 * compare here short-circuits the rebuild of every other card and its Radix
 * Tooltip subtree. A presence storm across many users still only touches
 * the affected cards.
 */
export const PartyMemberCard = memo(function PartyMemberCard({
  member,
}: {
  member: MockPartyMember
}) {
  const isDM = member.role === 'DM'
  const rolePillLabel =
    member.role === 'DM' ? 'DM' : member.role === 'SPECTATOR' ? 'SPECTATOR' : 'PLAYER'
  const rolePillClass =
    member.role === 'DM'
      ? 'party-card__role-chip party-card__role-chip--dm'
      : member.role === 'SPECTATOR'
        ? 'party-card__role-chip party-card__role-chip--spectator'
        : 'party-card__role-chip party-card__role-chip--player'
  const stats: Array<[string, number]> = [
    ['STR', member.stats.str],
    ['DEX', member.stats.dex],
    ['CON', member.stats.con],
    ['INT', member.stats.int],
    ['WIS', member.stats.wis],
    ['CHA', member.stats.cha],
  ]
  const metaParts = [
    member.characterClass,
    member.subClass,
    member.race,
    `Lv ${member.level}`,
  ].filter(Boolean) as string[]

  return (
    <div className="party-card-wrap">
      <div className={`party-card party-card--${member.status}${isDM ? ' party-card--dm' : ''}`}>
        <span
          className={`party-card__avatar party-card__avatar--${member.status}`}
          aria-hidden="true"
        >
          {member.avatarUrl ? (
            <img src={member.avatarUrl} alt="" className="party-card__avatar-image" />
          ) : (
            member.avatarInitials
          )}
        </span>
        <div className="party-card__body">
          <div className="party-card__info">
            <div className="party-card__name-row">
              <span className="party-card__char-name">{member.characterName}</span>
              {isDM && <span className={rolePillClass}>{rolePillLabel}</span>}
            </div>
            {!isDM && member.playerName !== member.characterName && (
              <span className="party-card__player-name">{member.playerName}</span>
            )}
            {!isDM && <span className="party-card__meta">{metaParts.join(' · ')}</span>}
            {member.activeCondition ? (
              <span
                className="party-card__condition-chip"
                title={`Condition: ${member.activeCondition}`}
              >
                Condition: {member.activeCondition}
              </span>
            ) : null}
          </div>
          {!isDM && (
            <div className="party-card__stats-column">
              <span className={`party-card__stats-role ${rolePillClass}`}>{rolePillLabel}</span>
              <div className="party-card__stats" aria-label="Ability scores">
                {stats.map(([k, v]) => (
                  <span key={k} className="party-card__stat">
                    <strong>{v}</strong>
                    <span>{k}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="party-card__footer">
            <div className="party-card__footer-left">
              <PartyStatusBadge status={member.status} />
            </div>
            <span className="party-card__seen">{formatLastSeen(member.lastSeenMs)}</span>
          </div>
        </div>
      </div>
    </div>
  )
})
