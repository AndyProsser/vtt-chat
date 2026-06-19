import { useEffect, useState, useMemo, useCallback } from 'react'
import type { UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import type { InventoryHistoryEntry } from '@/types/inventory'

interface OwnerOption {
  label: string
  ownerType: 'party' | 'character' | undefined
  ownerId: string | null | undefined
}

interface InventoryHistoryOverlayProps {
  campaignId: UUID
  apiUrl: string
  authToken: string
  onClose: () => void
  /** Optional list of characters to populate the owner filter. */
  ownerOptions?: OwnerOption[]
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
  const actor = entry.actorName
  const item = entry.itemName ?? 'item'
  const qty = entry.quantity != null ? ` ×${entry.quantity}` : ''
  switch (entry.actionType) {
    case 'ITEM_ADDED':
      return `${actor} added ${item}${qty} to ${entry.toOwnerName ?? 'inventory'}`
    case 'ITEM_REMOVED':
      return `${actor} removed ${item}${qty}`
    case 'ITEM_TRANSFERRED':
      return `${actor} moved ${item}${qty} to ${entry.toOwnerName ?? '?'}`
    case 'ITEM_EDITED':
      return `${actor} updated ${item}${qty}`
    case 'CURRENCY_CHANGED': {
      const delta = describeCurrencyDelta(entry.currencyDelta)
      return delta
        ? `${actor}: ${delta} in ${entry.toOwnerName ?? 'inventory'}`
        : `${actor} updated currency`
    }
    default:
      return `${actor}: ${item}`
  }
}

/** Format a Date as YYYY-MM-DD for <input type="date"> value */
function toDateInputValue(d: Date | null): string {
  if (!d) return ''
  return d.toISOString().slice(0, 10)
}

export function InventoryHistoryOverlay({
  campaignId,
  apiUrl,
  authToken,
  onClose,
  ownerOptions,
}: InventoryHistoryOverlayProps) {
  const [entries, setEntries] = useState<InventoryHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [filterAction, setFilterAction] = useState<string>('ALL')
  const [filterOwnerKey, setFilterOwnerKey] = useState<string>('ALL')
  const [dateFrom, setDateFrom] = useState<Date | null>(null)
  const [dateTo, setDateTo] = useState<Date | null>(null)

  const selectedOwner = useMemo<OwnerOption | undefined>(() => {
    if (filterOwnerKey === 'ALL' || !ownerOptions) return undefined
    return ownerOptions.find((o) => ownerKey(o) === filterOwnerKey)
  }, [filterOwnerKey, ownerOptions])

  const fetchHistory = useCallback(() => {
    setIsLoading(true)
    setError(null)

    const params = new URLSearchParams({ limit: '200' })
    if (selectedOwner?.ownerType) {
      params.set('ownerType', selectedOwner.ownerType)
      if (selectedOwner.ownerType === 'character' && selectedOwner.ownerId) {
        params.set('ownerId', selectedOwner.ownerId)
      }
    }
    if (dateFrom) params.set('dateFrom', dateFrom.toISOString())
    if (dateTo) {
      // Include the full dateTo day
      const end = new Date(dateTo)
      end.setHours(23, 59, 59, 999)
      params.set('dateTo', end.toISOString())
    }

    fetch(`${apiUrl}/api/inventory/${campaignId}/history?${params}`, {
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
  }, [campaignId, apiUrl, authToken, selectedOwner, dateFrom, dateTo])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const filtered = useMemo(
    () => (filterAction === 'ALL' ? entries : entries.filter((e) => e.actionType === filterAction)),
    [entries, filterAction]
  )

  return (
    <div className="inventory-history" aria-label="Inventory history">
      <header className="inventory-history__header">
        <span className="inventory-history__title">History</span>
        <button
          type="button"
          className="inventory-history__close"
          aria-label="Close history"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>

      <div className="inventory-history__filters">
        {/* Action type filter */}
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

        {/* Owner / character filter */}
        {ownerOptions && ownerOptions.length > 0 && (
          <select
            className="inventory-history__filter-select"
            value={filterOwnerKey}
            onChange={(e) => setFilterOwnerKey(e.target.value)}
            aria-label="Filter by owner"
          >
            <option value="ALL">All owners</option>
            {ownerOptions.map((o) => (
              <option key={ownerKey(o)} value={ownerKey(o)}>{o.label}</option>
            ))}
          </select>
        )}

        {/* Date range */}
        <div className="inventory-history__date-range">
          <input
            type="date"
            className="inventory-history__date-input"
            aria-label="From date"
            value={toDateInputValue(dateFrom)}
            onChange={(e) => setDateFrom(e.target.value ? new Date(e.target.value) : null)}
          />
          <span className="inventory-history__date-sep">–</span>
          <input
            type="date"
            className="inventory-history__date-input"
            aria-label="To date"
            value={toDateInputValue(dateTo)}
            onChange={(e) => setDateTo(e.target.value ? new Date(e.target.value) : null)}
          />
          {(dateFrom || dateTo) && (
            <button
              type="button"
              className="inventory-history__date-clear"
              aria-label="Clear date range"
              onClick={() => { setDateFrom(null); setDateTo(null) }}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>

      <div className="inventory-history__body">
        {isLoading ? (
          <p className="inventory-history__state">Loading…</p>
        ) : error ? (
          <p className="inventory-history__state inventory-history__state--error">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="inventory-history__state">No history for this filter.</p>
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

function ownerKey(o: OwnerOption): string {
  if (o.ownerType === 'party') return 'party'
  return `character:${o.ownerId ?? ''}`
}
