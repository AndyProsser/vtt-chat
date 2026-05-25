import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './primitives'

type TruncatedTextWithTooltipProps = {
  text: string
  className?: string
  as?: 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'p'
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
}

export function TruncatedTextWithTooltip({
  text,
  className,
  as = 'span',
  tooltipSide = 'top',
}: TruncatedTextWithTooltipProps) {
  const textRef = useRef<HTMLElement | null>(null)
  const [isTruncated, setIsTruncated] = useState(false)

  useEffect(() => {
    const element = textRef.current
    if (!element) {
      return
    }

    const updateTruncationState = () => {
      setIsTruncated(element.scrollWidth > element.clientWidth + 1)
    }

    updateTruncationState()

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateTruncationState) : null

    observer?.observe(element)
    window.addEventListener('resize', updateTruncationState)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateTruncationState)
    }
  }, [text])

  // Dynamic tag rendered via JSX (not createElement) to avoid the react-hooks/refs
  // lint rule flagging ref assignment inside a createElement() call.
  const Tag = as as React.ElementType
  const textElement = (
    <Tag
      ref={textRef as React.Ref<HTMLElement>}
      className={className}
      title={isTruncated ? text : undefined}
    >
      {text}
    </Tag>
  )

  if (!isTruncated) {
    return textElement
  }

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>{textElement}</TooltipTrigger>
        <TooltipContent side={tooltipSide}>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
