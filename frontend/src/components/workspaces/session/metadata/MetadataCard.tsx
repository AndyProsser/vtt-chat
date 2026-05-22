import type { ReactNode } from 'react'

interface MetadataCardProps {
  title: string
  value: string
  subtitle?: string
  status?: 'default' | 'success' | 'warning' | 'danger'
  actions?: ReactNode
}

const STATUS_CLASS: Record<NonNullable<MetadataCardProps['status']>, string> = {
  default: 'text-ui-primary',
  success: 'text-ui-success-text',
  warning: 'text-amber-300',
  danger: 'text-ui-error-text',
}

export function MetadataCard({
  title,
  value,
  subtitle,
  status = 'default',
  actions,
}: MetadataCardProps) {
  return (
    <article className="rounded-ui-md border border-ui-border bg-ui-surface p-3">
      <header className="mb-2 flex items-center justify-between gap-2">
        <p className="m-0 text-xs uppercase tracking-wide text-ui-secondary">{title}</p>
        {actions ? <div>{actions}</div> : null}
      </header>
      <p className={`m-0 text-sm font-semibold ${STATUS_CLASS[status]}`}>{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-ui-secondary">{subtitle}</p> : null}
    </article>
  )
}
