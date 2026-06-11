import { useEffect, useRef } from 'react'
import {
  LOCAL_SPEAKING_EVALUATION_INTERVAL_MS,
  LOCAL_SPEAKING_HOLD_MS,
  LOCAL_SPEAKING_RELEASE_LEVEL,
  LOCAL_SPEAKING_TRIGGER_LEVEL,
} from '@/constants/audioPanel.constants'

interface UseLocalSpeakingDetectionParams {
  isTransmittingNow: boolean
  localTransmitLevelRef: React.RefObject<number>
  setDevice: (patch: { isSpeaking: boolean }) => void
}

/**
 * Low-frequency polling loop (LOCAL_SPEAKING_EVALUATION_INTERVAL_MS) that reads
 * the mic level ref and sets `device.isSpeaking` via Zustand. Intentionally
 * interval-based (not RAF) to decouple from the audio frame rate and avoid
 * re-rendering AudioPanel + its tooltip subtree on every VAD tick.
 */
export function useLocalSpeakingDetection({
  isTransmittingNow,
  localTransmitLevelRef,
  setDevice,
}: UseLocalSpeakingDetectionParams) {
  const localSpeakingRef = useRef(false)
  const localSpeakingHoldUntilRef = useRef(0)

  useEffect(() => {
    const setSpeakingIfChanged = (nextValue: boolean) => {
      if (localSpeakingRef.current === nextValue) return
      localSpeakingRef.current = nextValue
      setDevice({ isSpeaking: nextValue })
    }

    if (!isTransmittingNow) {
      localSpeakingHoldUntilRef.current = 0
      setSpeakingIfChanged(false)
      return
    }

    const evaluate = () => {
      const now = performance.now()
      const transmittedMicLevel = localTransmitLevelRef.current

      if (transmittedMicLevel >= LOCAL_SPEAKING_TRIGGER_LEVEL) {
        localSpeakingHoldUntilRef.current = now + LOCAL_SPEAKING_HOLD_MS
        setSpeakingIfChanged(true)
        return
      }

      if (!localSpeakingRef.current) return

      if (transmittedMicLevel >= LOCAL_SPEAKING_RELEASE_LEVEL) {
        localSpeakingHoldUntilRef.current = now + LOCAL_SPEAKING_HOLD_MS
        return
      }

      if (now > localSpeakingHoldUntilRef.current) {
        setSpeakingIfChanged(false)
      }
    }

    evaluate()
    const intervalId = window.setInterval(evaluate, LOCAL_SPEAKING_EVALUATION_INTERVAL_MS)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [isTransmittingNow, localTransmitLevelRef, setDevice])

  useEffect(
    () => () => {
      localSpeakingRef.current = false
      localSpeakingHoldUntilRef.current = 0
      setDevice({ isSpeaking: false })
    },
    [setDevice]
  )
}
