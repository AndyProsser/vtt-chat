import { memo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import type { CurrencyWalletState } from '@/types/inventory'

type CoinKey = 'pp' | 'gp' | 'ep' | 'sp' | 'cp'

const COINS: Array<{ key: CoinKey; label: string; title: string }> = [
  { key: 'pp', label: 'PP', title: 'Platinum' },
  { key: 'gp', label: 'GP', title: 'Gold' },
  { key: 'ep', label: 'EP', title: 'Electrum' },
  { key: 'sp', label: 'SP', title: 'Silver' },
  { key: 'cp', label: 'CP', title: 'Copper' },
]

interface InventoryCurrencyRowProps {
  wallet: CurrencyWalletState | null
  isReadOnly: boolean
  onAdjust: (delta: Record<string, number>) => Promise<void>
}

export const InventoryCurrencyRow = memo(function InventoryCurrencyRow({
  wallet,
  isReadOnly,
  onAdjust,
}: InventoryCurrencyRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<CoinKey, string>>({
    pp: '0', gp: '0', ep: '0', sp: '0', cp: '0',
  })
  const [isSaving, setIsSaving] = useState(false)

  const amounts = wallet ?? { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }
  const hasAny = COINS.some(({ key }) => (amounts[key] as number) > 0)

  function openEdit() {
    setDraft({ pp: '0', gp: '0', ep: '0', sp: '0', cp: '0' })
    setEditing(true)
  }

  async function handleSave() {
    const delta: Record<string, number> = {}
    let hasChange = false
    for (const { key } of COINS) {
      const v = parseInt(draft[key], 10)
      if (!isNaN(v) && v !== 0) {
        delta[key] = v
        hasChange = true
      }
    }
    if (!hasChange) { setEditing(false); return }
    setIsSaving(true)
    try {
      await onAdjust(delta)
      setEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="inventory-currency-row inventory-currency-row--edit" aria-label="Adjust currency">
        <p className="inventory-currency-row__edit-hint">Enter change (+ to add, − to spend):</p>
        <div className="inventory-currency-row__edit-coins">
          {COINS.map(({ key, label, title }) => (
            <div key={key} className="inventory-currency-row__edit-coin" title={title}>
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
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Apply'}
          </button>
          <button
            type="button"
            className="inventory-add-form__cancel"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

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
        {!hasAny && (
          <span className="inventory-currency-row__empty">No currency</span>
        )}
      </div>
      {!isReadOnly && (
        <button
          type="button"
          className="inventory-currency-row__edit-btn"
          aria-label="Adjust currency"
          title="Adjust currency"
          onClick={openEdit}
        >
          <Icon name="notes" />
        </button>
      )}
    </div>
  )
})
