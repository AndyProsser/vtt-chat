import { useCallback, useEffect, useState } from 'react'

const TOOLTIP_LABELS_STORAGE_KEY = 'vtt-ui-tooltip-labels-enabled'
const TOOLTIP_LABELS_EVENT = 'vtt:ui-tooltip-labels-changed'

function parseStoredFlag(value: string | null): boolean {
  if (value === '0' || value === 'false') {
    return false
  }

  return true
}

function readTooltipLabelsEnabled(): boolean {
  if (typeof window === 'undefined') {
    return true
  }

  return parseStoredFlag(window.localStorage.getItem(TOOLTIP_LABELS_STORAGE_KEY))
}

export function setTooltipLabelsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(TOOLTIP_LABELS_STORAGE_KEY, enabled ? '1' : '0')
  window.dispatchEvent(
    new CustomEvent(TOOLTIP_LABELS_EVENT, {
      detail: { enabled },
    })
  )
}

/**
 * User preference for whether lightweight UI tooltip labels should render.
 */
export function useTooltipLabelsPreference() {
  const [tooltipLabelsEnabled, setTooltipLabelsEnabledState] =
    useState<boolean>(readTooltipLabelsEnabled)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== TOOLTIP_LABELS_STORAGE_KEY) {
        return
      }

      setTooltipLabelsEnabledState(parseStoredFlag(event.newValue))
    }

    const handlePreferenceEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ enabled?: boolean }>
      if (typeof customEvent.detail?.enabled === 'boolean') {
        setTooltipLabelsEnabledState(customEvent.detail.enabled)
        return
      }

      setTooltipLabelsEnabledState(readTooltipLabelsEnabled())
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener(TOOLTIP_LABELS_EVENT, handlePreferenceEvent)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(TOOLTIP_LABELS_EVENT, handlePreferenceEvent)
    }
  }, [])

  const setTooltipLabelsEnabledPreference = useCallback((enabled: boolean) => {
    setTooltipLabelsEnabled(enabled)
    setTooltipLabelsEnabledState(enabled)
  }, [])

  return {
    tooltipLabelsEnabled,
    setTooltipLabelsEnabled: setTooltipLabelsEnabledPreference,
  }
}
