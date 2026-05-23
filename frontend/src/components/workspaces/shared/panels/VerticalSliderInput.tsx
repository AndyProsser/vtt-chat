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
}

/**
 * A number input that reveals a vertical slider popover on hover.
 * The slider floats above the field and lets the user drag to change the value.
 * Clicking/typing in the input still works normally.
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
}: VerticalSliderInputProps) {
  const [hovered, setHovered] = React.useState(false)
  const [sliderActive, setSliderActive] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const showSlider = hovered || sliderActive

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
      onMouseEnter={() => {
        cancelHide()
        setHovered(true)
      }}
      onMouseLeave={scheduleHide}
    >
      {showSlider && !disabled && (
        <div className="vsi-slider-popover" onMouseEnter={cancelHide} onMouseLeave={scheduleHide}>
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
        disabled={disabled}
        aria-label={label}
      />
    </div>
  )
}
