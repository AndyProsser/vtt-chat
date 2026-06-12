import { useState, useEffect, useCallback } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useStore } from '@/hooks/useStore'
import { showToast } from '@/state/toastCenter'
import type { UUID } from '@shared'

interface CampaignMember {
  userId: UUID
  username: string
  displayName: string
}

interface TransferDMSectionProps {
  campaignId: UUID
  /** Disabled when the latest session is ACTIVE, PAUSED, or COOLDOWN. */
  isSessionBlocking: boolean
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || window.location.origin

async function fetchMembers(campaignId: UUID): Promise<CampaignMember[]> {
  const token = sessionStorage.getItem('authToken') ?? ''
  const res = await fetch(`${API_URL}/api/campaigns/${campaignId}/party-presence`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return []
  const data = await res.json()
  return (data.members ?? [])
    .filter((m: any) => m.role === 'PLAYER')
    .map((m: any) => ({
      userId: m.userId,
      username: m.username,
      displayName: m.displayName || m.username,
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
 * Danger-zone adjacent section for DM → player ownership transfer.
 * Shown only in campaign settings (DM-only context).
 * Only enabled when no session is active (IDLE / no session yet).
 */
export function TransferDMSection({ campaignId, isSessionBlocking }: TransferDMSectionProps) {
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<CampaignMember[]>([])
  const [selectedUserId, setSelectedUserId] = useState<UUID | null>(null)
  const [isInitiating, setIsInitiating] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  const outgoing = useStore((s) => s.outgoingDmTransfers[campaignId])
  const setOutgoing = useStore((s) => s.setOutgoingDmTransfer)
  const clearOutgoing = useStore((s) => s.clearOutgoingDmTransfer)

  // Fetch members when the dialog opens.
  useEffect(() => {
    if (!open) return
    fetchMembers(campaignId).then(setMembers)
  }, [open, campaignId])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) setSelectedUserId(null)
      setOpen(next)
    },
    []
  )

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

  const blockReason = isSessionBlocking
    ? 'DM transfer is not available during an active session.'
    : null

  if (outgoing) {
    return (
      <section className="csp-danger-zone csp-dm-transfer-pending" aria-label="DM transfer pending">
        <div className="csp-danger-zone-header">
          <span className="material-symbols-outlined csp-danger-zone-icon" aria-hidden="true">
            swap_horiz
          </span>
          <h5 className="csp-danger-zone-title">DM Transfer Pending</h5>
        </div>
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
      </section>
    )
  }

  return (
    <section className="csp-danger-zone" aria-label="Transfer campaign DM">
      <div className="csp-danger-zone-header">
        <span className="material-symbols-outlined csp-danger-zone-icon" aria-hidden="true">
          swap_horiz
        </span>
        <h5 className="csp-danger-zone-title">Transfer DM Role</h5>
      </div>

      <p className="csp-danger-zone-body">
        Assign another campaign member as the new DM. You will be demoted to Player. This cannot be
        undone without the new DM's cooperation.
        {blockReason && (
          <>
            {' '}
            <strong>{blockReason}</strong>
          </>
        )}
      </p>

      <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            className="csp-danger-zone-trigger"
            disabled={!!blockReason}
          >
            Transfer DM role
          </button>
        </DialogPrimitive.Trigger>

        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="session-modal-backdrop session-modal-backdrop--overlay" />
          <DialogPrimitive.Content className="session-modal session-modal--confirm-dialog session-modal--floating csp-delete-dialog csp-delete-dialog--anchored">
            <DialogPrimitive.Title className="csp-delete-dialog-title">
              <span className="material-symbols-outlined" aria-hidden="true">
                swap_horiz
              </span>
              Transfer DM Role
            </DialogPrimitive.Title>

            <DialogPrimitive.Description className="csp-delete-dialog-desc">
              Choose a player to offer the DM role to. They must accept the offer before the
              transfer takes effect. You will be notified of their response.
            </DialogPrimitive.Description>

            {members.length === 0 ? (
              <p className="csp-delete-dialog-desc">
                No players are available to transfer to. Invite players to the campaign first.
              </p>
            ) : (
              <div className="csp-dm-transfer-member-list">
                {members.map((m) => (
                  <label key={m.userId} className="csp-dm-transfer-member-row">
                    <input
                      type="radio"
                      name="dm-transfer-target"
                      value={m.userId}
                      checked={selectedUserId === m.userId}
                      onChange={() => setSelectedUserId(m.userId)}
                    />
                    <span className="csp-dm-transfer-member-name">{m.displayName}</span>
                    <span className="csp-dm-transfer-member-username">@{m.username}</span>
                  </label>
                ))}
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
    </section>
  )
}
