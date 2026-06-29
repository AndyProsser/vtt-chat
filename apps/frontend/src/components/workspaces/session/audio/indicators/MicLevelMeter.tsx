import { memo, useEffect, useRef, type RefObject } from 'react'

/**
 * MicLevelMeter
 *
 * Leaf component for visualising the local microphone transmit level.
 *
 * Purpose: keep the mic-level animation out of React's render path. The level is
 * read from a shared `RefObject<number>` (updated imperatively by the AudioPanel
 * meter loop) and written directly to a CSS variable on a single span. No React
 * state is ever set, so this leaf — and crucially its parents (AudioPanel,
 * AudioDevicePanel, AudioSettingsPanel) — do not re-render at mic frame rate.
 *
 * Driven by a ~30Hz `setInterval`, NOT `requestAnimationFrame`: this leaf is
 * always mounted (AudioDevicePanel renders unconditionally), so a per-frame rAF
 * loop would pin the browser refresh driver at 60fps for the entire session even
 * when the level is a flat zero — measurable idle CPU. A timer lets the refresh
 * driver sleep when nothing is actually animating, and 30Hz is smooth for a bar.
 *
 * This is the leaf-isolation pattern from copilot-instructions.md applied to a
 * non-Zustand high-frequency signal.
 */
const METER_RENDER_INTERVAL_MS = 33
interface MicLevelMeterProps {
  /** Stable ref holding the latest 0..1 mic level. Updated imperatively. */
  levelRef: RefObject<number>
  /** className applied to the outer wrapper span. */
  wrapperClassName: string
  /** className applied to the inner fill span (the bar that animates). */
  fillClassName: string
  /** CSS custom property name written on the fill element, e.g. '--audio-tx-level-height'. */
  cssVariable: string
  /** aria-label for the outer wrapper. */
  ariaLabel: string
}

function MicLevelMeterImpl({
  levelRef,
  wrapperClassName,
  fillClassName,
  cssVariable,
  ariaLabel,
}: MicLevelMeterProps) {
  const fillRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const fill = fillRef.current
    if (!fill) {
      return
    }

    let lastWritten = -1

    const tick = () => {
      const raw = levelRef.current
      const clamped = raw < 0 ? 0 : raw > 1 ? 1 : raw
      const percent = Math.round(clamped * 100)
      if (percent !== lastWritten) {
        lastWritten = percent
        fill.style.setProperty(cssVariable, `${percent}%`)
      }
    }

    tick()
    const intervalId = window.setInterval(tick, METER_RENDER_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [cssVariable, levelRef])

  return (
    <span className={wrapperClassName} aria-label={ariaLabel}>
      <span ref={fillRef} className={fillClassName} />
    </span>
  )
}

export const MicLevelMeter = memo(MicLevelMeterImpl)
