import { useCallback } from 'react'
import { showToast, type ShowToastInput } from '@/state/toastCenter'

export function useToast() {
  return useCallback((input: ShowToastInput) => showToast(input), [])
}
