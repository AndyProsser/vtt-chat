import { useCallback, useState } from 'react'
import type { UUID } from '@shared'
import { MAX_POSTER_DATA_URL_CHARS, MAX_POSTER_WIDTH_PX } from '@/constants/workspaces.constants'
import type { CampaignSettingsPayload } from '@/types/session/campaign'

type InviteType = 'PLAYER' | 'SPECTATOR'

type UseWorkspacesCampaignSettingsActionsParams = {
  apiUrl: string
  token: string
  fetchWithAuthGuard: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  settingsCampaignId: UUID | ''
  settingsData: CampaignSettingsPayload | null
  loadCampaignSettings: (campaignId: UUID) => Promise<CampaignSettingsPayload | null | void>
  saveCampaignSettings: () => Promise<void>
  setIsInviteReissuing: (value: boolean) => void
  setSettingsPosterUrl: (value: string) => void
  setError: (value: string | null) => void
  setLobbyNotice: (value: string | null) => void
  setShowCampaignSettingsModal: (value: boolean) => void
}

/**
 * Centralizes campaign settings side-effect actions (poster processing, invites, and save flow)
 * so the workspace shell stays focused on view composition.
 */
export function useWorkspacesCampaignSettingsActions(
  params: UseWorkspacesCampaignSettingsActionsParams
) {
  const {
    apiUrl,
    token,
    fetchWithAuthGuard,
    settingsCampaignId,
    settingsData,
    loadCampaignSettings,
    saveCampaignSettings,
    setIsInviteReissuing,
    setSettingsPosterUrl,
    setError,
    setLobbyNotice,
    setShowCampaignSettingsModal,
  } = params

  const [pendingInviteReissueType, setPendingInviteReissueType] = useState<InviteType | null>(null)

  const handleSaveCampaignSettings = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void (async () => {
        await saveCampaignSettings()
        setShowCampaignSettingsModal(false)
      })()
    },
    [saveCampaignSettings, setShowCampaignSettingsModal]
  )

  const handlePosterFileSelected = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) {
        return
      }

      if (!file.type.startsWith('image/')) {
        setError('Poster must be an image file.')
        return
      }

      const objectUrl = URL.createObjectURL(file)
      const img = new Image()

      img.onload = () => {
        try {
          const naturalWidth = Math.max(1, img.naturalWidth)
          const naturalHeight = Math.max(1, img.naturalHeight)
          const scale = naturalWidth > MAX_POSTER_WIDTH_PX ? MAX_POSTER_WIDTH_PX / naturalWidth : 1
          const targetWidth = Math.max(1, Math.round(naturalWidth * scale))
          const targetHeight = Math.max(1, Math.round(naturalHeight * scale))

          const canvas = document.createElement('canvas')
          canvas.width = targetWidth
          canvas.height = targetHeight

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            setError('Unable to process poster image.')
            return
          }

          ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

          let quality = 0.86
          let dataUrl = canvas.toDataURL('image/jpeg', quality)
          while (dataUrl.length > MAX_POSTER_DATA_URL_CHARS && quality > 0.56) {
            quality -= 0.1
            dataUrl = canvas.toDataURL('image/jpeg', quality)
          }
          setSettingsPosterUrl(dataUrl)
        } finally {
          URL.revokeObjectURL(objectUrl)
        }
      }

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        setError('Unable to read poster image.')
      }

      img.src = objectUrl
    },
    [setError, setSettingsPosterUrl]
  )

  const copyInviteUrl = useCallback(
    async (inviteType: InviteType) => {
      if (!settingsData) {
        return
      }

      const code =
        inviteType === 'PLAYER' ? settingsData.inviteCode : settingsData.spectatorInviteCode
      if (!code) {
        setError('Invite code is not available yet.')
        return
      }

      const basePath = inviteType === 'PLAYER' ? '/join/' : '/watch/'
      const inviteUrl = `${window.location.origin}${basePath}${encodeURIComponent(code)}`

      try {
        await navigator.clipboard.writeText(inviteUrl)
        setLobbyNotice(`${inviteType === 'PLAYER' ? 'Player' : 'Spectator'} invite URL copied.`)
      } catch {
        setError('Failed to copy invite URL to clipboard.')
      }
    },
    [setError, setLobbyNotice, settingsData]
  )

  const reissueInvite = useCallback(
    async (inviteType: InviteType) => {
      if (!settingsCampaignId) {
        return
      }

      setError(null)
      setIsInviteReissuing(true)

      try {
        const response = await fetchWithAuthGuard(
          `${apiUrl}/api/campaigns/${settingsCampaignId}/invites/reissue`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ type: inviteType }),
          }
        )

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || 'Failed to refresh invite')
        }

        await loadCampaignSettings(settingsCampaignId)
        setLobbyNotice(`${inviteType === 'PLAYER' ? 'Player' : 'Spectator'} invite refreshed.`)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to refresh invite'
        setError(message)
      } finally {
        setIsInviteReissuing(false)
      }
    },
    [
      apiUrl,
      fetchWithAuthGuard,
      loadCampaignSettings,
      setError,
      setIsInviteReissuing,
      setLobbyNotice,
      settingsCampaignId,
      token,
    ]
  )

  const requestInviteReissue = useCallback((inviteType: InviteType) => {
    setPendingInviteReissueType(inviteType)
  }, [])

  const handleConfirmInviteReissue = useCallback(async () => {
    if (!pendingInviteReissueType) {
      return
    }

    const inviteType = pendingInviteReissueType
    setPendingInviteReissueType(null)
    await reissueInvite(inviteType)

    if (!settingsData) {
      return
    }

    const code =
      inviteType === 'PLAYER' ? settingsData.inviteCode : settingsData.spectatorInviteCode
    if (!code) {
      return
    }

    const basePath = inviteType === 'PLAYER' ? '/join/' : '/watch/'
    const inviteUrl = `${window.location.origin}${basePath}${encodeURIComponent(code)}`
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setLobbyNotice(`${inviteType === 'PLAYER' ? 'Player' : 'Spectator'} invite URL copied.`)
    } catch {
      setError('Failed to copy invite URL to clipboard.')
    }
  }, [pendingInviteReissueType, reissueInvite, setError, setLobbyNotice, settingsData])

  return {
    pendingInviteReissueType,
    setPendingInviteReissueType,
    handleSaveCampaignSettings,
    handlePosterFileSelected,
    copyInviteUrl,
    requestInviteReissue,
    handleConfirmInviteReissue,
  }
}
