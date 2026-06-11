import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'

interface VerticalSliderInputProps {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  disabled?: boolean
  label: string
  id?: string
  className?: string
  triggerMode?: 'hover' | 'click'
}

/**
 * A number input that reveals a vertical slider popover on hover or click.
 * The slider floats above the field and lets the user drag to change the value.
 * Direct number entry remains available for both trigger modes.
 */
export function VerticalSliderInput({
  value,
  min,
  max,
  onChange,
  disabled,
  label,
  id,
  className,
  triggerMode = 'hover',
}: VerticalSliderInputProps) {
  const [hovered, setHovered] = React.useState(false)
  const [sliderActive, setSliderActive] = React.useState(false)
  const [clickOpen, setClickOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const showSlider = triggerMode === 'click' ? clickOpen || sliderActive : hovered || sliderActive

  function scheduleHide() {
    hideTimer.current = setTimeout(() => {
      setHovered(false)
    }, 120)
  }

  function cancelHide() {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }

  React.useEffect(() => {
    if (triggerMode !== 'click' || !clickOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setClickOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setClickOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [clickOpen, triggerMode])

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const parsed = parseInt(e.target.value, 10)
    if (!isNaN(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)))
    }
  }

  // Percentage for slider thumb position (inverted: top = max)
  const pct = ((value - min) / (max - min)) * 100

  return (
    <div
      ref={containerRef}
      className={`vsi-wrapper${className ? ` ${className}` : ''}`}
      onMouseEnter={
        triggerMode === 'hover'
          ? () => {
              cancelHide()
              setHovered(true)
            }
          : undefined
      }
      onMouseLeave={triggerMode === 'hover' ? scheduleHide : undefined}
    >
      {showSlider && !disabled && (
        <div
          className="vsi-slider-popover"
          onMouseEnter={triggerMode === 'hover' ? cancelHide : undefined}
          onMouseLeave={triggerMode === 'hover' ? scheduleHide : undefined}
        >
          <span className="vsi-max-label">{max}</span>
          <SliderPrimitive.Root
            className="vsi-slider-root"
            orientation="vertical"
            min={min}
            max={max}
            step={1}
            value={[value]}
            onValueChange={([v]) => onChange(v)}
            onPointerDown={() => setSliderActive(true)}
            onPointerUp={() => setSliderActive(false)}
            disabled={disabled}
            aria-label={label}
          >
            <SliderPrimitive.Track className="vsi-track">
              <SliderPrimitive.Range className="vsi-range" />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb className="vsi-thumb" />
          </SliderPrimitive.Root>
          <span className="vsi-min-label">{min}</span>
          <span className="vsi-value-bubble" style={{ bottom: `calc(${pct}% - 0.65rem)` }}>
            {value}
          </span>
        </div>
      )}
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        className="crbs-input"
        value={value}
        onChange={handleInputChange}
        onClick={
          triggerMode === 'click'
            ? () => {
                if (!disabled) {
                  setClickOpen(true)
                }
              }
            : undefined
        }
        onFocus={
          triggerMode === 'click'
            ? () => {
                if (!disabled) {
                  setClickOpen(true)
                }
              }
            : undefined
        }
        disabled={disabled}
        aria-label={label}
      />
    </div>
  )
}
