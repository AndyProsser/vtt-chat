import { memo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import type { UUID } from '@shared'
import type { CurrencyWalletState } from '@/types/inventory'

type CoinKey = 'pp' | 'gp' | 'ep' | 'sp' | 'cp'

const COINS: Array<{ key: CoinKey; label: string; title: string }> = [
  { key: 'pp', label: 'PP', title: 'Platinum' },
  { key: 'gp', label: 'GP', title: 'Gold' },
  { key: 'ep', label: 'EP', title: 'Electrum' },
  { key: 'sp', label: 'SP', title: 'Silver' },
  { key: 'cp', label: 'CP', title: 'Copper' },
]

const ZERO_DRAFT: Record<CoinKey, string> = { pp: '0', gp: '0', ep: '0', sp: '0', cp: '0' }

export interface CurrencyTransferTarget {
  label: string
  ownerType: 'party' | 'character'
  ownerId: UUID | null
  avatarUrl?: string | null
  isOnline?: boolean
}

interface InventoryCurrencyRowProps {
  wallet: CurrencyWalletState | null
  isReadOnly: boolean
  onAdjust: (delta: Record<string, number>) => Promise<void>
  /** Targets available for currency transfer. Empty = transfer button hidden. */
  transferTargets?: CurrencyTransferTarget[]
  /** Verb shown on the transfer button: "Give", "Take". Defaults to "Give". */
  transferActionLabel?: string
  /** All wallets in the campaign, used to show destination balance. */
  allWallets?: CurrencyWalletState[]
  onTransfer?: (
    toOwnerType: 'party' | 'character',
    toOwnerId: UUID | null,
    amounts: Partial<Record<CoinKey, number>>
  ) => Promise<{ code: string; message?: string; shortfall?: Record<string, number> } | void>
}

type RowMode = 'view' | 'adjust' | 'transfer'

function formatBalance(wallet: CurrencyWalletState | null | undefined): string {
  if (!wallet) return 'empty'
  const parts = COINS.filter(({ key }) => (wallet[key] as number) > 0).map(
    ({ key, label }) => `${wallet[key]} ${label}`
  )
  return parts.length > 0 ? parts.join(' · ') : 'empty'
}

export const InventoryCurrencyRow = memo(function InventoryCurrencyRow({
  wallet,
  isReadOnly,
  onAdjust,
  transferTargets,
  transferActionLabel = 'Give',
  allWallets,
  onTransfer,
}: InventoryCurrencyRowProps) {
  const [mode, setMode] = useState<RowMode>('view')
  const [draft, setDraft] = useState<Record<CoinKey, string>>(ZERO_DRAFT)
  const [isSaving, setIsSaving] = useState(false)
  // Transfer state
  const [selectedTarget, setSelectedTarget] = useState<CurrencyTransferTarget | null>(null)
  const [transferError, setTransferError] = useState<string | null>(null)

  const amounts = wallet ?? { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }
  const hasAny = COINS.some(({ key }) => (amounts[key] as number) > 0)

  const showTransferBtn = !isReadOnly && onTransfer && transferTargets && transferTargets.length > 0

  function openAdjust() {
    setDraft(ZERO_DRAFT)
    setMode('adjust')
  }

  function openTransfer() {
    setDraft(ZERO_DRAFT)
    setSelectedTarget(null)
    setTransferError(null)
    setMode('transfer')
  }

  function closeMode() {
    setMode('view')
    setSelectedTarget(null)
    setTransferError(null)
    setDraft(ZERO_DRAFT)
  }

  async function handleAdjustSave() {
    const delta: Record<string, number> = {}
    let hasChange = false
    for (const { key } of COINS) {
      const v = parseInt(draft[key], 10)
      if (!isNaN(v) && v !== 0) {
        delta[key] = v
        hasChange = true
      }
    }
    if (!hasChange) {
      setMode('view')
      return
    }
    setIsSaving(true)
    try {
      await onAdjust(delta)
      setMode('view')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleTransferConfirm() {
    if (!selectedTarget || !onTransfer) return
    const parsed: Partial<Record<CoinKey, number>> = {}
    let hasAmount = false
    for (const { key } of COINS) {
      const v = parseInt(draft[key], 10)
      if (!isNaN(v) && v > 0) {
        parsed[key] = v
        hasAmount = true
      }
    }
    if (!hasAmount) {
      setTransferError('Enter an amount to transfer.')
      return
    }
    setIsSaving(true)
    setTransferError(null)
    try {
      const result = await onTransfer(selectedTarget.ownerType, selectedTarget.ownerId, parsed)
      if (result && result.code) {
        setTransferError(
          result.code === 'INSUFFICIENT_FUNDS'
            ? 'Not enough funds in source wallet.'
            : (result.message ?? 'Transfer failed.')
        )
        return
      }
      closeMode()
    } finally {
      setIsSaving(false)
    }
  }

  const draftHasAmount = COINS.some(({ key }) => {
    const v = parseInt(draft[key], 10)
    return !isNaN(v) && v > 0
  })

  const destWallet = selectedTarget
    ? (allWallets?.find(
        (w) => w.ownerType === selectedTarget.ownerType && w.ownerId === selectedTarget.ownerId
      ) ?? null)
    : null

  // ─── Adjust mode ──────────────────────────────────────────────────────────
  if (mode === 'adjust') {
    const balanceSummary = formatBalance(wallet as CurrencyWalletState | null)

    return (
      <div
        className="inventory-currency-row inventory-currency-row--edit"
        aria-label="Adjust currency"
      >
        <p className="inventory-currency-row__balance">
          <span className="inventory-currency-row__balance-label">Balance:</span> {balanceSummary}
        </p>
        <p className="inventory-currency-row__edit-hint">Enter change (+ to add, − to spend):</p>
        <div className="inventory-currency-row__edit-coins">
          {COINS.map(({ key, label, title }) => (
            <div
              key={key}
              className="inventory-currency-row__edit-coin"
              data-coin={key}
              title={title}
            >
              <input
                className="inventory-currency-row__edit-input"
                type="number"
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                aria-label={title}
              />
              <span className="inventory-currency-row__label">{label}</span>
            </div>
          ))}
        </div>
        <div className="inventory-currency-row__edit-actions">
          <button
            type="button"
            className="inventory-add-form__save"
            onClick={handleAdjustSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Apply'}
          </button>
          <button type="button" className="inventory-add-form__cancel" onClick={closeMode}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ─── Transfer mode ────────────────────────────────────────────────────────
  if (mode === 'transfer') {
    const targets = transferTargets ?? []

    return (
      <div
        className="inventory-currency-row inventory-currency-row--transfer"
        aria-label="Transfer currency"
      >
        {/* Header */}
        <div className="inventory-currency-row__transfer-header">
          <span className="inventory-currency-row__transfer-title">
            {transferActionLabel} Currency
          </span>
          <button
            type="button"
            className="inventory-currency-row__transfer-cancel"
            onClick={closeMode}
          >
            Cancel
          </button>
        </div>

        {/* Balances */}
        <div className="inventory-currency-row__transfer-balances">
          <p className="inventory-currency-row__transfer-balance">
            <span className="inventory-currency-row__balance-label">From:</span>{' '}
            {formatBalance(wallet)}
          </p>
          {selectedTarget && (
            <p className="inventory-currency-row__transfer-balance inventory-currency-row__transfer-balance--dest">
              <span className="inventory-currency-row__balance-label">
                → {selectedTarget.label}:
              </span>{' '}
              {formatBalance(destWallet)}
            </p>
          )}
        </div>

        {/* Amount inputs */}
        <p className="inventory-currency-row__edit-hint">Amount to transfer:</p>
        <div className="inventory-currency-row__edit-coins">
          {COINS.map(({ key, label, title }) => (
            <div
              key={key}
              className="inventory-currency-row__edit-coin"
              data-coin={key}
              title={title}
            >
              <input
                className="inventory-currency-row__edit-input"
                type="number"
                min="0"
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                aria-label={title}
              />
              <span className="inventory-currency-row__label">{label}</span>
            </div>
          ))}
        </div>

        {/* Target grid */}
        <div
          className="inventory-currency-row__transfer-targets"
          role="listbox"
          aria-label="Transfer destination"
        >
          {targets.map((t) => {
            const key = `${t.ownerType}-${t.ownerId ?? 'party'}`
            const isSelected =
              selectedTarget?.ownerType === t.ownerType && selectedTarget?.ownerId === t.ownerId
            const avatarContent =
              t.ownerType === 'party' ? (
                <Icon name="party" />
              ) : t.avatarUrl ? (
                <img src={t.avatarUrl} alt="" />
              ) : (
                (t.label.trim()[0] ?? '?').toUpperCase()
              )

            return (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={[
                  'inventory-currency-row__transfer-target',
                  t.ownerType === 'party' ? 'inventory-currency-row__transfer-target--party' : '',
                  isSelected ? 'inventory-currency-row__transfer-target--selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setSelectedTarget(t)
                  setTransferError(null)
                }}
              >
                <span className="inventory-currency-row__transfer-target-avatar" aria-hidden="true">
                  {avatarContent}
                </span>
                <span className="inventory-currency-row__transfer-target-name">{t.label}</span>
              </button>
            )
          })}
        </div>

        {/* Error */}
        {transferError && (
          <p className="inventory-currency-row__transfer-error" role="alert">
            {transferError}
          </p>
        )}

        {/* Confirm */}
        <button
          type="button"
          className="inventory-add-form__save"
          onClick={handleTransferConfirm}
          disabled={!selectedTarget || !draftHasAmount || isSaving}
        >
          {isSaving ? 'Transferring…' : 'Confirm Transfer'}
        </button>
      </div>
    )
  }

  // ─── View mode ────────────────────────────────────────────────────────────
  return (
    <div className="inventory-currency-row" aria-label="Currency">
      <div className="inventory-currency-row__coins">
        {COINS.map(({ key, label, title }) => (
          <div
            key={key}
            className="inventory-currency-row__coin"
            data-coin={key}
            data-has-value={(amounts[key] as number) > 0}
            title={title}
          >
            <span className="inventory-currency-row__amount">{amounts[key]}</span>
            <span className="inventory-currency-row__label">{label}</span>
          </div>
        ))}
      </div>
      {!isReadOnly && (
        <div className="inventory-currency-row__actions">
          {showTransferBtn && (
            <button
              type="button"
              className="inventory-currency-row__edit-btn"
              aria-label={`${transferActionLabel} currency`}
              title={`${transferActionLabel} currency`}
              onClick={openTransfer}
            >
              <Icon name="send" />
            </button>
          )}
          <button
            type="button"
            className="inventory-currency-row__edit-btn"
            aria-label="Adjust currency"
            title="Adjust currency"
            onClick={openAdjust}
          >
            <Icon name="currency_exchange" />
          </button>
        </div>
      )}
    </div>
  )
})
