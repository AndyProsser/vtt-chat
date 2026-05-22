import type { ReactNode } from 'react'

export interface MetadataTimelineItem {
  id: string
  title: string
  detail?: string
  timestamp?: string
  badge?: ReactNode
}

interface MetadataTimelineProps {
  items: MetadataTimelineItem[]
  emptyMessage?: string
}

export function MetadataTimeline({
  items,
  emptyMessage = 'No timeline events available.',
}: MetadataTimelineProps) {
  if (!items.length) {
    return <p className="m-0 text-xs text-ui-secondary">{emptyMessage}</p>
  }

  return (
    <ol className="m-0 grid list-none gap-2 p-0" aria-label="Metadata timeline">
      {items.map((item) => (
        <li key={item.id} className="rounded-ui-md border border-ui-border bg-ui-surface p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="m-0 text-sm font-semibold text-ui-primary">{item.title}</p>
            {item.badge ? <span>{item.badge}</span> : null}
          </div>
          {item.detail ? <p className="m-0 text-xs text-ui-secondary">{item.detail}</p> : null}
          {item.timestamp ? (
            <p className="mt-1 text-[11px] uppercase tracking-wide text-ui-secondary">
              {item.timestamp}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
