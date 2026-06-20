/**
 * LootSplitCard
 * Rendered inside the chat stream when a DM proposes a /loot-split.
 * Shows each player's share, live acceptance state (from lootSplitSlice),
 * a countdown timer, and an Accept button for the current user.
 *
 * After the split expires the card switches to a frozen "Expired" state.
 * Already-accepted entries show a checkmark; the current user's row shows
 * the Accept button until they click it.
 */

import { useState, useEffect, useCallback } from 'react'
import type { UUID } from '@shared'
import type { LootSplitCardMetadata } from '@shared'
import { useStore } from '@/state/store'
import { Icon } from '@/components/ui/Icon'
import '@/styles/components/workspaces/session/chat/LootSplitCard.css'

interface LootSplitCardProps {
  metadata: LootSplitCardMetadata
  campaignId: UUID
  currentUserId: UUID
  participantDirectory: Record<string, { displayName: string; avatarUrl?: string | null }>
}

function useCountdown(expiresAt: number): number {
  const [remaining, setRemaining] = useState(() => Math.max(0, expiresAt - Date.now()))
  useEffect(() => {
    if (remaining <= 0) return
    const id = setInterval(() => {
      setRemaining(Math.max(0, expiresAt - Date.now()))
    }, 1000)
    return () => clearInterval(id)
  }, [expiresAt, remaining])
  return remaining
}

function getApiBase(): string {
  const configured = import.meta.env.VITE_API_URL?.trim()
  return configured || window.location.origin
}

function getStoredToken(): string {
  return sessionStorage.getItem('authToken') ?? ''
}

export function LootSplitCard({
  metadata,
  campaignId,
  currentUserId,
  participantDirectory,
}: LootSplitCardProps) {
  const split = useStore((state) => state.activeLootSplits[metadata.splitId as UUID])

  // Initialise store from message metadata on first render (handles history refresh case)
  const handleLootSplitProposed = useStore((state) => state.handleLootSplitProposed)
  useEffect(() => {
    if (!split) {
      handleLootSplitProposed({
        id: metadata.splitId as UUID,
        type: 'INVENTORY:LOOT_SPLIT_PROPOSED',
        version: 1,
        userId: metadata.proposedByUserId as UUID,
        userRole: 'DM' as any,
        sessionId: '' as UUID,
        roomId: null,
        timestamp: metadata.expiresAt - 60_000,
        payload: {
          campaignId,
          splitId: metadata.splitId,
          itemId: '' as UUID,
          itemName: metadata.itemName,
          totalQuantity: metadata.totalQuantity,
          shares: metadata.shares,
          proposedByUserId: metadata.proposedByUserId,
          expiresAt: metadata.expiresAt,
          proposedAt: metadata.expiresAt - 60_000,
        },
      })
    }
  // Only run once per card mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shares = split?.shares ?? metadata.shares.map((s) => ({ ...s, accepted: false }))
  const expired = split?.expired ?? Date.now() > metadata.expiresAt
  const remaining = useCountdown(expired ? 0 : metadata.expiresAt)

  const myShare = shares.find((s) => s.userId === currentUserId)
  const alreadyAccepted = myShare?.accepted ?? false
  const inSplit = myShare != null

  const [isAccepting, setIsAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  const handleAccept = useCallback(async () => {
    setIsAccepting(true)
    setAcceptError(null)
    try {
      const res = await fetch(
        `${getApiBase()}/api/inventory/${campaignId}/loot-split/${metadata.splitId}/accept`,
        { method: 'POST', headers: { Authorization: `Bearer ${getStoredToken()}` } }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setAcceptError(body.message ?? 'Failed to accept. Try again.')
      }
    } catch {
      setAcceptError('Network error. Try again.')
    } finally {
      setIsAccepting(false)
    }
  }, [campaignId, metadata.splitId])

  const secondsLeft = Math.ceil(remaining / 1000)
  const allAccepted = shares.every((s) => s.accepted)

  return (
    <article className="loot-split-card" aria-label={`Loot split: ${metadata.itemName}`}>
      <header className="loot-split-card__header">
        <Icon name="inventory_2" className="loot-split-card__icon" />
        <span className="loot-split-card__title">
          Loot Split — <strong>{metadata.itemName}</strong>
          {metadata.totalQuantity > 1 ? ` ×${metadata.totalQuantity}` : ''}
        </span>
        {!expired && !allAccepted && (
          <span
            className={`loot-split-card__timer${secondsLeft <= 10 ? ' loot-split-card__timer--urgent' : ''}`}
            aria-live="polite"
          >
            {secondsLeft}s
          </span>
        )}
        {(expired || allAccepted) && (
          <span className={`loot-split-card__status${allAccepted ? ' loot-split-card__status--done' : ' loot-split-card__status--expired'}`}>
            {allAccepted ? 'Complete' : 'Expired'}
          </span>
        )}
      </header>

      <ul className="loot-split-card__shares">
        {shares.map((share) => {
          const profile = participantDirectory[share.userId]
          const displayName = profile?.displayName ?? share.userId
          return (
            <li
              key={share.userId}
              className={`loot-split-card__share${share.accepted ? ' loot-split-card__share--accepted' : ''}`}
            >
              <span className="loot-split-card__share-name">{displayName}</span>
              <span className="loot-split-card__share-qty">×{share.quantity}</span>
              {share.accepted ? (
                <Icon name="check" className="loot-split-card__share-check" />
              ) : (
                <span className="loot-split-card__share-pending" aria-label="pending" />
              )}
            </li>
          )
        })}
      </ul>

      {inSplit && !alreadyAccepted && !expired && (
        <div className="loot-split-card__actions">
          <button
            type="button"
            className="loot-split-card__accept-btn"
            disabled={isAccepting}
            onClick={handleAccept}
          >
            {isAccepting ? 'Accepting…' : `Accept ×${myShare!.quantity}`}
          </button>
          {acceptError && (
            <p className="loot-split-card__error" role="alert">{acceptError}</p>
          )}
        </div>
      )}
    </article>
  )
}
