import type { SVGProps, ReactElement } from 'react'

type IconName =
  | 'search'
  | 'journal'
  | 'history'
  | 'settings'
  | 'close'
  | 'voice'
  | 'rooms'
  | 'users'
  | 'mic'
  | 'panel'
  | 'chat'
  | 'notes'

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
}

export function Icon({ name, className = '', ...props }: IconProps) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  const paths: Record<IconName, ReactElement> = {
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
    journal: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 7h6M9 11h6M9 15h4" />
      </>
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 2.64-6.36" />
        <path d="M3 3v6h6" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.02.02a2 2 0 1 1-2.83 2.83l-.02-.02a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V22a2 2 0 1 1-4 0v-.03a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.02.02a2 2 0 1 1-2.83-2.83l.02-.02a1.7 1.7 0 0 0 .34-1.88 1.7 1.7 0 0 0-1.55-1H2a2 2 0 1 1 0-4h.03a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.02-.02a2 2 0 1 1 2.83-2.83l.02.02a1.7 1.7 0 0 0 1.88.34h.01a1.7 1.7 0 0 0 1-1.55V2a2 2 0 1 1 4 0v.03a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.88-.34l.02-.02a2 2 0 1 1 2.83 2.83l-.02.02a1.7 1.7 0 0 0-.34 1.88v.01a1.7 1.7 0 0 0 1.55 1H22a2 2 0 1 1 0 4h-.03a1.7 1.7 0 0 0-1.55 1z" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    voice: (
      <>
        <path d="M4 10v4" />
        <path d="M7 8v8" />
        <path d="M10 6v12" />
        <path d="M13 8v8" />
        <path d="M16 10v4" />
        <path d="M19 12h1" />
      </>
    ),
    rooms: (
      <>
        <path d="M3 7h18" />
        <path d="M3 12h18" />
        <path d="M3 17h18" />
        <circle cx="6" cy="7" r="1" fill="currentColor" stroke="none" />
        <circle cx="6" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="6" cy="17" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        <circle cx="17" cy="9" r="2" />
        <path d="M15 19c0-1.7.7-3.2 2-4.2" />
      </>
    ),
    mic: (
      <>
        <rect x="9" y="4" width="6" height="11" rx="3" />
        <path d="M6 11a6 6 0 1 0 12 0" />
        <path d="M12 18v3" />
        <path d="M9 21h6" />
      </>
    ),
    panel: (
      <>
        <rect x="3" y="4" width="7" height="16" rx="2" />
        <rect x="12" y="4" width="9" height="16" rx="2" />
      </>
    ),
    chat: (
      <>
        <path d="M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
      </>
    ),
    notes: (
      <>
        <rect x="6" y="3" width="12" height="18" rx="2" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </>
    ),
  }

  return (
    <svg aria-hidden="true" {...common} {...props} className={`h-4 w-4 ${className}`}>
      {paths[name]}
    </svg>
  )
}
