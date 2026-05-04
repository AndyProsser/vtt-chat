import type { ReactNode } from 'react'

type PolicyNoticeTone = 'danger' | 'warning' | 'info' | 'success'

interface PolicyNoticeProps {
  title: string
  tone: PolicyNoticeTone
  children: ReactNode
  actionLabel?: string
  onAction?: () => void
}

const toneClasses: Record<
  PolicyNoticeTone,
  {
    container: string
    action: string
  }
> = {
  danger: {
    container: 'border-ui-error-text bg-ui-error-surface text-ui-error-text',
    action: 'border-ui-error-text text-ui-error-text hover:bg-ui-error-surface/80',
  },
  warning: {
    container: 'border-amber-300 bg-amber-50 text-amber-900',
    action: 'border-amber-500 text-amber-900 hover:bg-amber-100',
  },
  info: {
    container: 'border-blue-300 bg-blue-50 text-blue-900',
    action: 'border-blue-500 text-blue-900 hover:bg-blue-100',
  },
  success: {
    container: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    action: 'border-emerald-500 text-emerald-900 hover:bg-emerald-100',
  },
}

export function PolicyNotice({ title, tone, children, actionLabel, onAction }: PolicyNoticeProps) {
  const classes = toneClasses[tone]

  return (
    <div className={`rounded-ui-sm border p-3 text-sm ${classes.container}`}>
      <p className="m-0 font-semibold">{title}</p>
      <div className="mt-1">{children}</div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className={`mt-3 rounded-ui-sm border px-3 py-2 text-sm font-medium ${classes.action}`}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
