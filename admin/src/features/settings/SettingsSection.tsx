import type { ReactNode } from 'react'

interface SettingsSectionProps {
  title: string
  children: ReactNode
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <article className="admin-card settings-card">
      <h3>{title}</h3>
      {children}
    </article>
  )
}
