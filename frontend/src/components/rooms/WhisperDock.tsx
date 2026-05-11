import type { ReactNode } from 'react'

interface WhisperDockProps {
  children: ReactNode
}

export function WhisperDock({ children }: WhisperDockProps) {
  return <div className="room-selector-whisper-dock">{children}</div>
}
