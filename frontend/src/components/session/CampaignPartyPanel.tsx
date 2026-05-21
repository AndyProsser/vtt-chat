/** CampaignPartyPanel — party sheet for the offline lobby workspace.
 * Displays campaign members in a table with status, avatar, character/player info,
 * stats (STR/DEX/CON/INT/WIS/CHA), and last-seen timestamp.
 *
 * In DEV mode an ephemeral set of mock players is generated locally for visual
 * previewing. Mock data lives only in component state and is never persisted.
 */
import { useCallback, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../core-ui'
import {
  type MockPartyMember,
  type MockPlayerStatus,
  formatLastSeen,
  generateMockParty,
} from './CampaignPartyPanel.mockData'
import '../../styles/components/session/CampaignPartyPanel.css'

const IS_DEV = import.meta.env.DEV

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<MockPlayerStatus, string> = {
  online: 'Online',
  away: 'Away',
  offline: 'Offline',
}

const STATUS_SYMBOL: Record<MockPlayerStatus, string> = {
  online: 'radio_button_checked',
  away: 'schedule',
  offline: 'radio_button_unchecked',
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: MockPlayerStatus }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`party-sheet__status-icon party-sheet__status-icon--${status}`}
          aria-label={STATUS_LABELS[status]}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {STATUS_SYMBOL[status]}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{STATUS_LABELS[status]}</TooltipContent>
    </Tooltip>
  )
}

function MemberAvatar({ initials, status }: { initials: string; status: MockPlayerStatus }) {
  return (
    <span className={`party-sheet__avatar party-sheet__avatar--${status}`} aria-hidden="true">
      {initials}
    </span>
  )
}

function StatGrid({ stats }: { stats: MockPartyMember['stats'] }) {
  const entries: Array<[string, number]> = [
    ['STR', stats.str],
    ['DEX', stats.dex],
    ['CON', stats.con],
    ['INT', stats.int],
    ['WIS', stats.wis],
    ['CHA', stats.cha],
  ]

  return (
    <div className="party-sheet__stat-grid" aria-label="Ability scores">
      {entries.map(([key, value]) => (
        <span key={key} className="party-sheet__stat" aria-label={`${key} ${value}`}>
          <strong className="party-sheet__stat-value">{value}</strong>
          <span className="party-sheet__stat-label">{key}</span>
        </span>
      ))}
    </div>
  )
}

function MemberRow({ member }: { member: MockPartyMember }) {
  return (
    <tr className="party-sheet__row">
      {/* Status */}
      <td className="party-sheet__cell party-sheet__cell--status">
        <StatusIcon status={member.status} />
      </td>

      {/* Avatar */}
      <td className="party-sheet__cell party-sheet__cell--avatar">
        <MemberAvatar initials={member.avatarInitials} status={member.status} />
      </td>

      {/* Character name + player name tooltip */}
      <td className="party-sheet__cell party-sheet__cell--name">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="party-sheet__char-name">{member.characterName}</span>
          </TooltipTrigger>
          <TooltipContent side="right">
            <span className="party-sheet__player-tooltip">
              <span className="material-symbols-outlined" aria-hidden="true">
                person
              </span>
              {member.playerName}
            </span>
          </TooltipContent>
        </Tooltip>
      </td>

      {/* Race */}
      <td className="party-sheet__cell party-sheet__cell--race">{member.race}</td>

      {/* Class */}
      <td className="party-sheet__cell party-sheet__cell--class">{member.characterClass}</td>

      {/* Level */}
      <td className="party-sheet__cell party-sheet__cell--level">{member.level}</td>

      {/* Stat block */}
      <td className="party-sheet__cell party-sheet__cell--stats">
        <StatGrid stats={member.stats} />
      </td>

      {/* Last seen */}
      <td className="party-sheet__cell party-sheet__cell--last-seen">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="party-sheet__last-seen">{formatLastSeen(member.lastSeenMs)}</span>
          </TooltipTrigger>
          <TooltipContent side="left">
            {new Date(member.lastSeenMs).toLocaleString()}
          </TooltipContent>
        </Tooltip>
      </td>
    </tr>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

interface CampaignPartyPanelProps {
  campaignName?: string
}

export function CampaignPartyPanel({ campaignName }: CampaignPartyPanelProps) {
  const [members, setMembers] = useState<MockPartyMember[]>(() =>
    IS_DEV ? generateMockParty() : []
  )

  const handleRefresh = useCallback(() => {
    setMembers(generateMockParty())
  }, [])

  const onlineCount = members.filter((m) => m.status === 'online').length

  return (
    <section className="party-sheet" aria-label="Party sheet">
      {/* Header */}
      <header className="party-sheet__header">
        <div className="party-sheet__header-info">
          <h4 className="party-sheet__title">Party</h4>
          {members.length > 0 && (
            <span className="party-sheet__count-badge">
              {onlineCount} / {members.length}
            </span>
          )}
        </div>

        {IS_DEV && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="party-sheet__refresh-btn"
                aria-label="Regenerate mock party"
                onClick={handleRefresh}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  refresh
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">Regenerate mock party (DEV)</TooltipContent>
          </Tooltip>
        )}
      </header>

      {/* Table */}
      {members.length === 0 ? (
        <p className="party-sheet__empty">No party members yet.</p>
      ) : (
        <div className="party-sheet__table-wrap">
          <table className="party-sheet__table" aria-label="Party members">
            <thead>
              <tr className="party-sheet__head-row">
                <th className="party-sheet__th party-sheet__th--status" aria-label="Status" />
                <th className="party-sheet__th party-sheet__th--avatar" aria-label="Avatar" />
                <th className="party-sheet__th">Character</th>
                <th className="party-sheet__th">Race</th>
                <th className="party-sheet__th">Class</th>
                <th className="party-sheet__th party-sheet__th--level">Lvl</th>
                <th className="party-sheet__th party-sheet__th--stats">Stats</th>
                <th className="party-sheet__th party-sheet__th--last-seen">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <MemberRow key={member.id} member={member} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
