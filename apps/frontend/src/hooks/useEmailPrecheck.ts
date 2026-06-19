import { useCallback, useEffect, useRef, useState } from 'react'
import type { EmailCheckStatus, InviteCampaign, PlayerPrecheckResult, PolicyCode } from '@/types/invite'
import { isValidEmailFormat } from '@/utils/inviteJoin'

interface UseEmailPrecheckParams {
  apiUrl: string
  inviteCode: string
  campaign: InviteCampaign | null
  /** Pre-fills the email field and auto-triggers the precheck (e.g. when the extension passes email via URL). */
  initialEmail?: string
  setError: (message: string | null) => void
  setErrorCode: (code: PolicyCode) => void
  /** Called after a successful precheck so the parent can pre-fill player/character fields. */
  onPrecheckSuccess?: (result: PlayerPrecheckResult, emailValue: string) => void
}

/** Manages email input, debounced precheck requests, and the resulting account-status state. */
export function useEmailPrecheck({
  apiUrl,
  inviteCode,
  campaign,
  initialEmail,
  setError,
  setErrorCode,
  onPrecheckSuccess,
}: UseEmailPrecheckParams) {
  const [emailRaw, setEmailRaw] = useState(initialEmail?.trim() ?? '')
  const [emailChecked, setEmailChecked] = useState(false)
  const [emailCheckStatus, setEmailCheckStatus] = useState<EmailCheckStatus>('idle')
  const [precheckLoading, setPrecheckLoading] = useState(false)
  const [precheckResult, setPrecheckResult] = useState<PlayerPrecheckResult | null>(null)
  const [fullAccountPassword, setFullAccountPassword] = useState('')
  const precheckRequestIdRef = useRef(0)
  const onPrecheckSuccessRef = useRef(onPrecheckSuccess)
  onPrecheckSuccessRef.current = onPrecheckSuccess

  // Wrap setEmail so that any email change immediately resets precheck state.
  const setEmail = useCallback(
    (nextEmail: string) => {
      setEmailRaw(nextEmail)
      setEmailChecked(false)
      setPrecheckResult(null)
      setFullAccountPassword('')
      setPrecheckLoading(false)
      const trimmed = nextEmail.trim()
      if (!trimmed) {
        setEmailCheckStatus('idle')
      } else if (!isValidEmailFormat(trimmed)) {
        setEmailCheckStatus('invalid')
      }
    },
    []
  )

  const runEmailPrecheck = useCallback(
    async (params: { requestId: number; emailValue: string }) => {
      if (!campaign || !params.emailValue.trim()) return

      setPrecheckLoading(true)
      setEmailCheckStatus('checking')

      try {
        const response = await fetch(`${apiUrl}/api/auth/validate/player`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviteCode, email: params.emailValue.trim() }),
        })

        const data = (await response.json().catch(() => ({}))) as PlayerPrecheckResult & {
          code?: string
          message?: string
        }

        if (!response.ok) {
          if (precheckRequestIdRef.current !== params.requestId) return
          if (data.code === 'INVITE_EXPIRED') setErrorCode('INVITE_EXPIRED')
          throw new Error(data.message || 'Unable to check email for invite')
        }

        if (precheckRequestIdRef.current !== params.requestId) return

        setPrecheckResult(data)
        setEmailChecked(true)
        setEmailCheckStatus(data.accountStatus)
        onPrecheckSuccessRef.current?.(data, params.emailValue)
      } catch (precheckError) {
        if (precheckRequestIdRef.current !== params.requestId) return
        const message =
          precheckError instanceof Error ? precheckError.message : 'Email check failed'
        setError(message)
        setEmailChecked(false)
        setPrecheckResult(null)
        setEmailCheckStatus('error')
      } finally {
        if (precheckRequestIdRef.current === params.requestId) {
          setPrecheckLoading(false)
        }
      }
    },
    [apiUrl, campaign, inviteCode, setError, setErrorCode]
  )

  useEffect(() => {
    const trimmedEmail = emailRaw.trim()
    if (!trimmedEmail || !isValidEmailFormat(trimmedEmail)) return

    const requestId = precheckRequestIdRef.current + 1
    precheckRequestIdRef.current = requestId

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        setPrecheckLoading(true)
        setEmailCheckStatus('checking')
        await runEmailPrecheck({ requestId, emailValue: trimmedEmail })
      })()
    }, 500)

    return () => window.clearTimeout(timeoutId)
  }, [emailRaw, runEmailPrecheck])

  const isFullUserEmail = precheckResult?.accountStatus === 'full'
  const canEditJoinFields = emailChecked && !isFullUserEmail

  return {
    email: emailRaw,
    setEmail,
    emailChecked,
    emailCheckStatus,
    precheckLoading,
    precheckResult,
    fullAccountPassword,
    setFullAccountPassword,
    isFullUserEmail,
    canEditJoinFields,
  }
}
