import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/utils/cn'
import '@/styles/components/ui/Slider.css'

export interface SliderProps extends Omit<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>,
  'value' | 'defaultValue' | 'onValueChange' | 'onValueCommit'
> {
  value: number
  defaultValue?: number
  onValueChange?: (value: number) => void
  onValueCommit?: (value: number) => void
  trackClassName?: string
  rangeClassName?: string
  thumbClassName?: string
}

const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, SliderProps>(
  (
    {
      className,
      trackClassName,
      rangeClassName,
      thumbClassName,
      value,
      defaultValue,
      min = 0,
      max = 100,
      step = 1,
      onValueChange,
      onValueCommit,
      ...props
    },
    ref
  ) => {
    const safeValue = Number.isFinite(value) ? value : min
    const safeDefaultValue =
      typeof defaultValue === 'number' && Number.isFinite(defaultValue) ? defaultValue : undefined

    return (
      <SliderPrimitive.Root
        ref={ref}
        className={cn('ui-slider', className)}
        min={min}
        max={max}
        step={step}
        value={[safeValue]}
        defaultValue={safeDefaultValue !== undefined ? [safeDefaultValue] : undefined}
        onValueChange={(next) => {
          if (typeof onValueChange === 'function') {
            onValueChange(next[0] ?? safeValue)
          }
        }}
        onValueCommit={(next) => {
          if (typeof onValueCommit === 'function') {
            onValueCommit(next[0] ?? safeValue)
          }
        }}
        {...props}
      >
        <SliderPrimitive.Track className={cn('ui-slider__track', trackClassName)}>
          <SliderPrimitive.Range className={cn('ui-slider__range', rangeClassName)} />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className={cn('ui-slider__thumb', thumbClassName)} />
      </SliderPrimitive.Root>
    )
  }
)

Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
