import type { ReactNode } from 'react'

interface PanelProps {
  title?: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function Panel({ title, subtitle, actions, children, className = '' }: PanelProps) {
  return (
    <section className={`rounded-ui-md border border-ui-border bg-ui-surface p-3 ${className}`}>
      {title || subtitle || actions ? (
        <header className="mb-2 flex items-start justify-between gap-2">
          <div>
            {title ? <h3 className="m-0 text-sm font-semibold text-ui-primary">{title}</h3> : null}
            {subtitle ? <p className="m-0 mt-0.5 text-xs text-ui-secondary">{subtitle}</p> : null}
          </div>
          {actions ? <div>{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  )
}
