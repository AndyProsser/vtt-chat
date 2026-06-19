import { useState, useEffect, useCallback } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { SessionState } from '@shared'
import { useStore } from '@/hooks/useStore'
import { showToast } from '@/state/toastCenter'
import type { UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'

/** Only online members can receive a handoff offer. */
const ONLINE_STATUSES = new Set(['HERE', 'AWAY', 'LOBBY'])

interface CampaignMember {
  userId: UUID
  username: string
  displayName: string
  playerName: string | null
  characterName: string | null
  characterClass: string | null
  level: number | null
}

export interface TransferDMSectionProps {
  campaignId: UUID
  /**
   * Current session state string. Transfer is only permitted when this is
   * SessionState.IDLE (greenroom). Pass null when no session exists.
   */
  sessionState: string | null
}

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() || window.location.origin

async function fetchOnlineMembers(campaignId: UUID): Promise<CampaignMember[]> {
  const token = sessionStorage.getItem('authToken') ?? ''
  const res = await fetch(`${API_URL}/api/campaigns/${campaignId}/party-presence`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return []
  const data = await res.json()
  return (data.members ?? [])
    .filter((m: any) => m.role === 'PLAYER' && ONLINE_STATUSES.has(m.status))
    .map((m: any) => ({
      userId: m.userId,
      username: m.username,
      displayName: m.displayName || m.username,
      playerName: m.playerName || null,
      characterName: m.characterName || null,
      characterClass: m.characterClass || null,
      level: m.level ?? null,
    }))
}

async function initiateTransfer(campaignId: UUID, targetUserId: UUID): Promise<boolean> {
  const token = sessionStorage.getItem('authToken') ?? ''
  const res = await fetch(`${API_URL}/api/campaigns/${campaignId}/dm/handoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ targetUserId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    showToast({
      message: err.message || 'Failed to initiate transfer',
      variant: 'error',
    })
    return false
  }
  return true
}

async function cancelTransfer(campaignId: UUID): Promise<boolean> {
  const token = sessionStorage.getItem('authToken') ?? ''
  const res = await fetch(`${API_URL}/api/campaigns/${campaignId}/dm/handoff/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.ok
}

/**
 * DM → player ownership transfer section, rendered inside the in-session
 * settings panel. Only active when the session is in IDLE (greenroom) state
 * and the target player is online.
 */
export function TransferDMSection({ campaignId, sessionState }: TransferDMSectionProps) {
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<CampaignMember[]>([])
  const [selectedUserId, setSelectedUserId] = useState<UUID | null>(null)
  const [isInitiating, setIsInitiating] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  const outgoing = useStore((s) => s.outgoingDmTransfers[campaignId])
  const setOutgoing = useStore((s) => s.setOutgoingDmTransfer)
  const clearOutgoing = useStore((s) => s.clearOutgoingDmTransfer)

  const isIdle = sessionState === SessionState.IDLE

  // Fetch online members when the dialog opens.
  useEffect(() => {
    if (!open) return
    fetchOnlineMembers(campaignId).then(setMembers)
  }, [open, campaignId])

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) setSelectedUserId(null)
    setOpen(next)
  }, [])

  const handleInitiate = useCallback(async () => {
    if (!selectedUserId || isInitiating) return
    const target = members.find((m) => m.userId === selectedUserId)
    if (!target) return

    setIsInitiating(true)
    const ok = await initiateTransfer(campaignId, selectedUserId)
    setIsInitiating(false)

    if (ok) {
      setOpen(false)
      setSelectedUserId(null)
      setOutgoing({
        campaignId,
        toUserId: selectedUserId,
        toUsername: target.username,
        initiatedAt: Date.now(),
        expiresAt: Date.now() + 86_400_000,
      })
      showToast({
        message: `DM transfer offer sent to ${target.displayName}. Waiting for their response.`,
        variant: 'success',
        durationMs: 6000,
      })
    }
  }, [selectedUserId, isInitiating, members, campaignId, setOutgoing])

  const handleCancel = useCallback(async () => {
    if (isCancelling) return
    setIsCancelling(true)
    const ok = await cancelTransfer(campaignId)
    setIsCancelling(false)
    if (ok) {
      clearOutgoing(campaignId)
      showToast({ message: 'DM transfer offer cancelled.', variant: 'info', durationMs: 4000 })
    }
  }, [isCancelling, campaignId, clearOutgoing])

  if (outgoing) {
    return (
      <div className="csp-card-collapsible-body">
        <p className="csp-danger-zone-body">
          Waiting for <strong>{outgoing.toUsername}</strong> to accept the DM handoff. Until they
          respond, you remain the DM.
        </p>
        <button
          type="button"
          className="csp-danger-zone-trigger"
          disabled={isCancelling}
          onClick={handleCancel}
        >
          {isCancelling ? 'Cancelling…' : 'Cancel offer'}
        </button>
      </div>
    )
  }

  const blockReason = !isIdle
    ? 'Transfer is only available while the session is in the greenroom (IDLE).'
    : null

  return (
    <div className="csp-card-collapsible-body">
      <p className="csp-danger-zone-body">
        Assign a currently-online player as the new DM. They must accept before the transfer takes
        effect. You will be demoted to Player — this cannot be undone without the new DM's
        cooperation.
        {blockReason && (
          <>
            {' '}
            <strong>{blockReason}</strong>
          </>
        )}
      </p>

      <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <DialogPrimitive.Trigger asChild>
          <button type="button" className="csp-danger-zone-trigger" disabled={!!blockReason}>
            Transfer DM role
          </button>
        </DialogPrimitive.Trigger>

        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="session-modal-backdrop session-modal-backdrop--overlay" />
          <DialogPrimitive.Content className="session-modal session-modal--confirm-dialog session-modal--floating csp-delete-dialog csp-delete-dialog--anchored">
            <DialogPrimitive.Title className="csp-delete-dialog-title">
              <Icon name="swap_horiz" />
              Transfer DM Role
            </DialogPrimitive.Title>

            <DialogPrimitive.Description className="csp-delete-dialog-desc">
              Choose an online player to offer the DM role to. They must accept before the transfer
              takes effect.
            </DialogPrimitive.Description>

            {members.length === 0 ? (
              <p className="csp-delete-dialog-desc">
                No players are online right now. The target player must be present in the greenroom
                to receive the offer.
              </p>
            ) : (
              <div
                className="csp-dm-transfer-member-list"
                role="listbox"
                aria-label="Select player"
              >
                {members.map((m) => {
                  const isSelected = selectedUserId === m.userId
                  return (
                    <button
                      key={m.userId}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`csp-dm-transfer-member-row${isSelected ? ' is-selected' : ''}`}
                      onClick={() => setSelectedUserId(m.userId)}
                    >
                      <span className="csp-dm-transfer-member-info">
                        <span className="csp-dm-transfer-member-primary">
                          {m.characterName ?? m.displayName}
                          {m.characterClass && (
                            <span className="csp-dm-transfer-member-class">
                              {m.level != null ? ` Lv${m.level} ` : ' '}
                              {m.characterClass}
                            </span>
                          )}
                        </span>
                        <span className="csp-dm-transfer-member-secondary">
                          {m.playerName && (
                            <span className="csp-dm-transfer-member-player">{m.playerName}</span>
                          )}
                          <span className="csp-dm-transfer-member-username">@{m.username}</span>
                        </span>
                      </span>
                      {isSelected && <Icon name="check" className="csp-dm-transfer-member-check" />}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="csp-delete-dialog-actions">
              <DialogPrimitive.Close asChild>
                <button type="button" className="csp-delete-dialog-cancel" disabled={isInitiating}>
                  Cancel
                </button>
              </DialogPrimitive.Close>
              <button
                type="button"
                className="csp-danger-zone-trigger"
                disabled={!selectedUserId || isInitiating || members.length === 0}
                onClick={handleInitiate}
              >
                {isInitiating ? 'Sending offer…' : 'Send handoff offer'}
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  )
}
