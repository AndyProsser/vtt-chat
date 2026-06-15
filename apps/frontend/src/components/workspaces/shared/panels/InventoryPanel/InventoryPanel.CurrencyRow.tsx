import { memo } from 'react'
import type { CurrencyWalletState } from '@/types/inventory'

const COIN_LABELS: Array<{ key: keyof Pick<CurrencyWalletState, 'pp' | 'gp' | 'ep' | 'sp' | 'cp'>; label: string; title: string }> = [
  { key: 'pp', label: 'PP', title: 'Platinum' },
  { key: 'gp', label: 'GP', title: 'Gold' },
  { key: 'ep', label: 'EP', title: 'Electrum' },
  { key: 'sp', label: 'SP', title: 'Silver' },
  { key: 'cp', label: 'CP', title: 'Copper' },
]

interface InventoryCurrencyRowProps {
  wallet: CurrencyWalletState | null
  isReadOnly: boolean
}

export const InventoryCurrencyRow = memo(function InventoryCurrencyRow({
  wallet,
}: InventoryCurrencyRowProps) {
  const amounts = wallet ?? { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }
  const hasAny = COIN_LABELS.some(({ key }) => amounts[key] > 0)

  return (
    <div className="inventory-currency-row" aria-label="Currency">
      {COIN_LABELS.map(({ key, label, title }) => (
        <div
          key={key}
          className="inventory-currency-row__coin"
          data-coin={key}
          data-has-value={amounts[key] > 0}
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
  )
})
