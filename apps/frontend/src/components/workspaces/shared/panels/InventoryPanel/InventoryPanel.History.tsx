import { useEffect, useState, useMemo } from 'react'
import type { UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import type { InventoryHistoryEntry } from '@/types/inventory'

interface InventoryHistoryOverlayProps {
  campaignId: UUID
  apiUrl: string
  authToken: string
  onClose: () => void
}

const ACTION_LABELS: Record<string, string> = {
  ITEM_ADDED: 'Added',
  ITEM_REMOVED: 'Removed',
  ITEM_TRANSFERRED: 'Moved',
  ITEM_EDITED: 'Edited',
  CURRENCY_CHANGED: 'Currency',
}

const ALL_ACTIONS = Object.keys(ACTION_LABELS)

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function describeCurrencyDelta(delta: InventoryHistoryEntry['currencyDelta']): string {
  if (!delta) return ''
  const COINS = ['pp', 'gp', 'ep', 'sp', 'cp'] as const
  const parts = COINS.filter((k) => delta[k] && delta[k] !== 0)
    .map((k) => `${(delta[k] as number) > 0 ? '+' : ''}${delta[k]}${k}`)
  return parts.join(' ')
}

function describeAction(entry: InventoryHistoryEntry): string {
  switch (entry.actionType) {
    case 'ITEM_ADDED':
      return `${entry.itemName ?? 'item'} ×${entry.quantity ?? 1} → ${entry.toOwnerType ?? 'inventory'}`
    case 'ITEM_REMOVED':
      return `${entry.itemName ?? 'item'} ×${entry.quantity ?? 1} removed`
    case 'ITEM_TRANSFERRED':
      return `${entry.itemName ?? 'item'} ×${entry.quantity ?? 1}: ${entry.fromOwnerType ?? '?'} → ${entry.toOwnerType ?? '?'}`
    case 'ITEM_EDITED':
      return `${entry.itemName ?? 'item'} updated${entry.quantity != null ? ` ×${entry.quantity}` : ''}`
    case 'CURRENCY_CHANGED':
      return describeCurrencyDelta(entry.currencyDelta) || 'currency updated'
    default:
      return entry.itemName ?? entry.actionType
  }
}

export function InventoryHistoryOverlay({
  campaignId,
  apiUrl,
  authToken,
  onClose,
}: InventoryHistoryOverlayProps) {
  const [entries, setEntries] = useState<InventoryHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterAction, setFilterAction] = useState<string>('ALL')

  useEffect(() => {
    setIsLoading(true)
    setError(null)
    fetch(`${apiUrl}/api/inventory/${campaignId}/history?limit=100`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.json()
      })
      .then((data: { history: InventoryHistoryEntry[] }) => {
        setEntries(data.history)
      })
      .catch(() => setError('Failed to load history.'))
      .finally(() => setIsLoading(false))
  }, [campaignId, apiUrl, authToken])

  const filtered = useMemo(
    () => (filterAction === 'ALL' ? entries : entries.filter((e) => e.actionType === filterAction)),
    [entries, filterAction]
  )

  return (
    <div className="inventory-history" aria-label="Inventory history">
      <header className="inventory-history__header">
        <span className="inventory-history__title">History</span>
        <div className="inventory-history__filter">
          <select
            className="inventory-history__filter-select"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            aria-label="Filter by action"
          >
            <option value="ALL">All actions</option>
            {ALL_ACTIONS.map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a]}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="inventory-history__close"
          aria-label="Close history"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>

      <div className="inventory-history__body">
        {isLoading ? (
          <p className="inventory-history__state">Loading…</p>
        ) : error ? (
          <p className="inventory-history__state inventory-history__state--error">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="inventory-history__state">No history yet.</p>
        ) : (
          <ul className="inventory-history__list">
            {filtered.map((entry) => (
              <li key={entry.id} className={`inventory-history__entry inventory-history__entry--${entry.actionType.toLowerCase().replace('_', '-')}`}>
                <span className="inventory-history__entry-badge">
                  {ACTION_LABELS[entry.actionType] ?? entry.actionType}
                </span>
                <span className="inventory-history__entry-desc">{describeAction(entry)}</span>
                <span className="inventory-history__entry-time">{relativeTime(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
