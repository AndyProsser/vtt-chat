/**
 * LoadingSpinner Component
 * Accessible, spec-conformant loading indicator.
 * Uses CSS custom properties from theme.css.
 * The `spinner-spin` keyframe is defined in theme.css.
 */
import type React from 'react'
import '../../styles/components/ui/LoadingSpinner.css'

export interface LoadingSpinnerProps {
  /** Accessible label announced to screen-readers. Default: "Loading…" */
  label?: string
  /** Visual size. Default: "md" */
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_MAP: Record<NonNullable<LoadingSpinnerProps['size']>, string> = {
  sm: '1rem',
  md: '1.5rem',
  lg: '2rem',
}

export function LoadingSpinner({ label = 'Loading…', size = 'md' }: LoadingSpinnerProps) {
  const px = SIZE_MAP[size]

  return (
    <span
      role="status"
      aria-label={label}
      data-testid="loading-spinner"
      className="vtt-spinner"
      style={{ '--spinner-size': px } as React.CSSProperties}
    />
  )
}
