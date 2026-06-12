import { useCallback, useState } from 'react'
import { useStore } from '@/hooks/useStore'
import { showToast } from '@/state/toastCenter'
import type { UUID } from '@shared'

interface DmTransferOfferBannerProps {
  campaignId: UUID
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || window.location.origin

async function respondToTransfer(
  campaignId: UUID,
  action: 'accept' | 'decline'
): Promise<boolean> {
  const token = sessionStorage.getItem('authToken') ?? ''
  const res = await fetch(`${API_URL}/api/campaigns/${campaignId}/dm/handoff/${action}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.ok
}

/**
 * Persistent banner shown to a player when they have a pending DM handoff offer
 * for the currently-selected campaign. Mounts in the lobby workspace frame.
 */
export function DmTransferOfferBanner({ campaignId }: DmTransferOfferBannerProps) {
  const offer = useStore((s) => s.incomingDmTransfers[campaignId])
  const clearIncoming = useStore((s) => s.clearIncomingDmTransfer)
  const [isResponding, setIsResponding] = useState(false)

  const handleRespond = useCallback(
    async (action: 'accept' | 'decline') => {
      if (isResponding) return
      setIsResponding(true)
      const ok = await respondToTransfer(campaignId, action)
      setIsResponding(false)

      if (ok) {
        clearIncoming(campaignId)
        if (action === 'accept') {
          showToast({
            message: `You are now the DM of ${offer?.campaignName ?? 'this campaign'}.`,
            variant: 'success',
            durationMs: 8000,
          })
        } else {
          showToast({
            message: 'DM transfer declined.',
            variant: 'info',
            durationMs: 4000,
          })
        }
      } else {
        showToast({
          message: 'Failed to respond. Please try again.',
          variant: 'error',
        })
      }
    },
    [isResponding, campaignId, clearIncoming, offer]
  )

  if (!offer) return null

  return (
    <div className="dm-transfer-offer-banner" role="alert" aria-live="polite">
      <div className="dm-transfer-offer-banner__icon">
        <span className="material-symbols-outlined" aria-hidden="true">
          swap_horiz
        </span>
      </div>
      <div className="dm-transfer-offer-banner__body">
        <strong className="dm-transfer-offer-banner__title">DM Handoff Offer</strong>
        <span className="dm-transfer-offer-banner__message">
          <strong>{offer.fromUsername}</strong> is offering you the DM role for{' '}
          <strong>{offer.campaignName}</strong>.
        </span>
      </div>
      <div className="dm-transfer-offer-banner__actions">
        <button
          type="button"
          className="dm-transfer-offer-banner__btn dm-transfer-offer-banner__btn--accept"
          disabled={isResponding}
          onClick={() => handleRespond('accept')}
        >
          {isResponding ? '…' : 'Accept'}
        </button>
        <button
          type="button"
          className="dm-transfer-offer-banner__btn dm-transfer-offer-banner__btn--decline"
          disabled={isResponding}
          onClick={() => handleRespond('decline')}
        >
          {isResponding ? '…' : 'Decline'}
        </button>
      </div>
    </div>
  )
}
