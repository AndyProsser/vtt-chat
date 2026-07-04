/**
 * LootSplitCard
 * Rendered inside the chat stream when a DM uses /loot-split.
 * Shows the completed split — who received what — immediately.
 * No accept button, no countdown. The split is applied server-side on command execution.
 */

import type { UUID } from '@shared'
import type { LootSplitCardMetadata } from '@shared'
import { Icon } from '@/components/ui/Icon'
import '@/styles/components/workspaces/session/chat/LootSplitCard.css'

interface LootSplitCardProps {
  metadata: LootSplitCardMetadata
  participantDirectory: Record<string, { displayName: string; avatarUrl?: string | null }>
}

export function LootSplitCard({ metadata, participantDirectory }: LootSplitCardProps) {
  return (
    <article className="loot-split-card" aria-label={`Loot split: ${metadata.itemName}`}>
      <header className="loot-split-card__header">
        <Icon name="inventory_2" className="loot-split-card__icon" />
        <span className="loot-split-card__title">
          Loot Split — <strong>{metadata.itemName}</strong>
          {metadata.totalQuantity > 1 ? ` ×${metadata.totalQuantity}` : ''}
        </span>
        <span className="loot-split-card__status loot-split-card__status--done">Applied</span>
      </header>

      <ul className="loot-split-card__shares">
        {metadata.shares.map((share) => {
          const profile = participantDirectory[share.userId as UUID]
          const displayName = profile?.displayName ?? share.userId
          return (
            <li
              key={share.userId}
              className="loot-split-card__share loot-split-card__share--accepted"
            >
              <span className="loot-split-card__share-name">{displayName}</span>
              <span className="loot-split-card__share-qty">×{share.quantity}</span>
              <Icon name="check" className="loot-split-card__share-check" />
            </li>
          )
        })}
        {metadata.remainder > 0 && (
          <li className="loot-split-card__share loot-split-card__share--remainder">
            <span className="loot-split-card__share-name">Party</span>
            <span className="loot-split-card__share-qty">×{metadata.remainder}</span>
            <span className="loot-split-card__share-remainder-label">remainder</span>
          </li>
        )}
      </ul>
    </article>
  )
}
