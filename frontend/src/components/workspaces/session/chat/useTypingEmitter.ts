import { useCallback, useEffect, useRef } from 'react'
import { TYPING_IDLE_TIMEOUT_MS } from '@/constants/chatPresence.constants'

interface UseTypingEmitterParams {
  onTypingStarted?: () => void
  onTypingStopped?: () => void
}

interface UseTypingEmitterResult {
  emitTypingStarted: () => void
  emitTypingStopped: () => void
  scheduleTypingStop: () => void
}

/**
 * Manages typing indicator emission with debounced stop.
 * Calling emitTypingStopped also cancels any pending stop timer.
 */
export function useTypingEmitter({
  onTypingStarted,
  onTypingStopped,
}: UseTypingEmitterParams): UseTypingEmitterResult {
  const isTypingRef = useRef(false)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const emitTypingStopped = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }
    if (!isTypingRef.current) return
    isTypingRef.current = false
    onTypingStopped?.()
  }, [onTypingStopped])

  const emitTypingStarted = useCallback(() => {
    if (isTypingRef.current) return
    isTypingRef.current = true
    onTypingStarted?.()
  }, [onTypingStarted])

  const scheduleTypingStop = useCallback(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      emitTypingStopped()
    }, TYPING_IDLE_TIMEOUT_MS)
  }, [emitTypingStopped])

  useEffect(() => {
    return () => {
      emitTypingStopped()
    }
  }, [emitTypingStopped])

  return { emitTypingStarted, emitTypingStopped, scheduleTypingStop }
}
