import { useCallback, useEffect, useMemo, useState } from 'react'
import type { InviteValidationResult, PolicyCode } from '@/types/invite'

interface UseInviteValidationParams {
  apiUrl: string
  inviteCode: string
}

/** Validates the player invite code on mount and exposes the campaign info. */
export function useInviteValidation({ apiUrl, inviteCode }: UseInviteValidationParams) {
  const [loading, setLoading] = useState(true)
  const [validation, setValidation] = useState<InviteValidationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<PolicyCode>(null)

  const validateInvite = useCallback(async () => {
    setLoading(true)
    setError(null)
    setErrorCode(null)

    try {
      const response = await fetch(
        `${apiUrl}/api/campaigns/invite/${encodeURIComponent(inviteCode)}/validate`
      )
      const data = (await response.json()) as InviteValidationResult
      setValidation(data)
      if (!response.ok && 'reason' in data && data.reason === 'INVITE_EXPIRED') {
        setErrorCode('INVITE_EXPIRED')
      }
    } catch {
      setError('Failed to validate invite code')
    } finally {
      setLoading(false)
    }
  }, [apiUrl, inviteCode])

  // Defer initial validation to avoid synchronous state updates in the effect body.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void validateInvite()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [validateInvite])

  const campaign = useMemo(() => {
    if (!validation || !validation.valid || validation.type !== 'player') return null
    return validation.campaign
  }, [validation])

  return { loading, campaign, error, errorCode, setError, setErrorCode, validateInvite }
}
