/**
 * LoadingSpinner Component
 * Accessible, spec-conformant loading indicator.
 * Uses CSS custom properties from theme.css.
 * The `spinner-spin` keyframe is defined in theme.css.
 */
import '../../styles/components/ui/LoadingSpinner.css'

export interface LoadingSpinnerProps {
  /** Accessible label announced to screen-readers. Default: "Loading…" */
  label?: string
  /** Visual size. Default: "md" */
  size?: 'sm' | 'md' | 'lg'
}

export function LoadingSpinner({ label = 'Loading…', size = 'md' }: LoadingSpinnerProps) {
  const sizeClass = `vtt-spinner--${size}`

  return (
    <span
      role="status"
      aria-label={label}
      data-testid="loading-spinner"
      className={`vtt-spinner ${sizeClass}`}
    />
  )
}
