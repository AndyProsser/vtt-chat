import type { ReactNode } from 'react'

interface SettingsFieldProps {
  label: string
  htmlFor: string
  children: ReactNode
}

export function SettingsField({ label, htmlFor, children }: SettingsFieldProps) {
  return (
    <>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </>
  )
}
