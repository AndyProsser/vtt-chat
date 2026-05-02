import { useEffect, useMemo, useState } from 'react'
import type {
  CampaignRoomsResponse,
  CampaignStatusFilter,
  CampaignSummary,
  RecordingDraft,
  RecordingSummary,
} from '@/types/campaigns'
import {
  fetchCampaigns,
  fetchCampaignRecordings,
  fetchCampaignRooms,
  requestArchiveToggle,
  requestCampaignExport,
  requestCampaignImport,
  requestMovePlayer,
  requestRecordingCreate,
  requestSessionEnd,
} from './campaignManagementApi'
import {
  buildCampaignQueryString,
  sanitizeDurationSeconds,
  selectInitialMemberRoom,
  withSessionRoomRetained,
} from './campaignManagementUtils'

const EMPTY_RECORDING_DRAFT: RecordingDraft = {
  title: '',
  sessionId: '',
  roomId: '',
  sourceUrl: '',
  storageKey: '',
  durationSeconds: '',
  startedAt: '',
  endedAt: '',
  journalSummary: '',
}

export function useCampaignManagement() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CampaignStatusFilter>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [roomsError, setRoomsError] = useState<string | null>(null)
  const [selectedCampaignRooms, setSelectedCampaignRooms] = useState<CampaignRoomsResponse | null>(
    null
  )
  const [endingSessionId, setEndingSessionId] = useState<string | null>(null)
  const [archivingCampaignId, setArchivingCampaignId] = useState<string | null>(null)
  const [moveBusyUserId, setMoveBusyUserId] = useState<string | null>(null)
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [targetRoomId, setTargetRoomId] = useState('')
  const [recordingsLoading, setRecordingsLoading] = useState(false)
  const [recordingsError, setRecordingsError] = useState<string | null>(null)
  const [recordings, setRecordings] = useState<RecordingSummary[]>([])
  const [recordingBusy, setRecordingBusy] = useState(false)
  const [exportBusyCampaignId, setExportBusyCampaignId] = useState<string | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [exportBundleText, setExportBundleText] = useState('')
  const [importBundleText, setImportBundleText] = useState('')
  const [portabilityMessage, setPortabilityMessage] = useState<string | null>(null)
  const [recordingDraft, setRecordingDraft] = useState<RecordingDraft>(EMPTY_RECORDING_DRAFT)

  const queryString = useMemo(() => {
    return buildCampaignQueryString({
      search,
      status: statusFilter,
      page,
      pageSize,
    })
  }, [page, pageSize, search, statusFilter])

  const selectedCampaign = useMemo(() => {
    if (!selectedCampaignId) {
      return null
    }

    return campaigns.find((campaign) => campaign.id === selectedCampaignId) || null
  }, [campaigns, selectedCampaignId])

  useEffect(() => {
    const loadCampaigns = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetchCampaigns(queryString)

        setCampaigns(response.campaigns)
        setTotal(response.total)
        setTotalPages(response.totalPages)

        const preferredId = selectedCampaignId || response.campaigns[0]?.id || null
        setSelectedCampaignId(preferredId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load campaigns')
      } finally {
        setLoading(false)
      }
    }

    void loadCampaigns()
  }, [queryString, selectedCampaignId])

  useEffect(() => {
    if (!selectedCampaign) {
      return
    }

    const loadRooms = async () => {
      setRoomsLoading(true)
      setRoomsError(null)

      try {
        const response = await fetchCampaignRooms(
          selectedCampaign.id,
          selectedCampaign.latestSession?.id
        )

        const members = response.members || []
        const rooms = response.rooms || []

        const initialSelection = selectInitialMemberRoom(members, rooms, selectedMemberId)

        if (initialSelection) {
          if (!selectedMemberId) {
            setSelectedMemberId(initialSelection.memberId)
          }
          if (!targetRoomId) {
            setTargetRoomId(initialSelection.roomId)
          }

          setRecordingDraft((current) => ({
            ...current,
            sessionId: current.sessionId || response.session?.id || '',
            roomId: current.roomId || initialSelection.roomId,
          }))
        }

        setSelectedCampaignRooms(response)
      } catch (err) {
        setRoomsError(err instanceof Error ? err.message : 'Failed to load room details')
      } finally {
        setRoomsLoading(false)
      }
    }

    void loadRooms()
  }, [selectedCampaign, selectedMemberId, targetRoomId])

  useEffect(() => {
    if (!selectedCampaign) {
      return
    }

    const loadRecordings = async () => {
      setRecordingsLoading(true)
      setRecordingsError(null)

      try {
        const response = await fetchCampaignRecordings(selectedCampaign.id)
        setRecordings(response.recordings || [])
      } catch (err) {
        setRecordingsError(err instanceof Error ? err.message : 'Failed to load recordings')
      } finally {
        setRecordingsLoading(false)
      }
    }

    void loadRecordings()
  }, [selectedCampaign])

  const refreshCampaigns = async () => {
    const refreshed = await fetchCampaigns(queryString)

    setCampaigns(refreshed.campaigns)
    setTotal(refreshed.total)
    setTotalPages(refreshed.totalPages)
  }

  const refreshRecordings = async (campaignId: string) => {
    const response = await fetchCampaignRecordings(campaignId)

    setRecordings(response.recordings || [])
  }

  const endSession = async (campaign: CampaignSummary) => {
    if (!campaign.latestSession) {
      return
    }

    if (
      !window.confirm(
        `End session "${campaign.latestSession.name}" for campaign "${campaign.name}"?`
      )
    ) {
      return
    }

    setEndingSessionId(campaign.latestSession.id)
    setError(null)
    setPortabilityMessage(null)

    try {
      await requestSessionEnd(campaign, 'Admin operation: ended from Rooms & Campaigns page')
      await refreshCampaigns()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end session')
    } finally {
      setEndingSessionId(null)
    }
  }

  const toggleArchive = async (campaign: CampaignSummary, shouldArchive: boolean) => {
    const actionLabel = shouldArchive ? 'archive' : 'restore'
    if (!window.confirm(`Confirm ${actionLabel} for campaign "${campaign.name}"?`)) {
      return
    }

    setArchivingCampaignId(campaign.id)
    setError(null)
    setPortabilityMessage(null)

    try {
      await requestArchiveToggle(
        campaign,
        shouldArchive,
        `Admin operation: ${actionLabel} campaign`
      )

      await refreshCampaigns()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${actionLabel} campaign`)
    } finally {
      setArchivingCampaignId(null)
    }
  }

  const movePlayer = async () => {
    if (
      !selectedCampaign ||
      !selectedCampaignRooms?.session ||
      !selectedMemberId ||
      !targetRoomId
    ) {
      return
    }

    const member = selectedCampaignRooms.members?.find((item) => item.userId === selectedMemberId)
    if (!member || member.primaryRoomId === targetRoomId) {
      return
    }

    setMoveBusyUserId(member.userId)
    setError(null)
    setPortabilityMessage(null)

    try {
      await requestMovePlayer({
        campaignId: selectedCampaign.id,
        sessionId: selectedCampaignRooms.session.id,
        roomId: targetRoomId,
        targetUserId: member.userId,
        reason: 'Admin operation: move player from campaign control panel',
      })

      const refreshedRooms = await fetchCampaignRooms(
        selectedCampaign.id,
        selectedCampaignRooms.session.id
      )

      setSelectedCampaignRooms(refreshedRooms)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move player')
    } finally {
      setMoveBusyUserId(null)
    }
  }

  const exportCampaign = async (campaign: CampaignSummary) => {
    setExportBusyCampaignId(campaign.id)
    setError(null)
    setPortabilityMessage(null)

    try {
      const response = await requestCampaignExport(campaign.id)

      setExportBundleText(JSON.stringify(response.bundle, null, 2))
      setPortabilityMessage(`${response.message} (${response.artifactId})`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export campaign')
    } finally {
      setExportBusyCampaignId(null)
    }
  }

  const importCampaign = async () => {
    if (!importBundleText.trim()) {
      setError('Paste an export bundle before importing')
      return
    }

    let bundle: unknown
    try {
      bundle = JSON.parse(importBundleText)
    } catch {
      setError('Import bundle must be valid JSON')
      return
    }

    setImportBusy(true)
    setError(null)
    setPortabilityMessage(null)

    try {
      const response = await requestCampaignImport(bundle)

      await refreshCampaigns()
      setSelectedCampaignId(response.campaign.id)
      setPortabilityMessage(`${response.message} (${response.artifactId})`)
      setImportBundleText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import campaign')
    } finally {
      setImportBusy(false)
    }
  }

  const updateRecordingDraft = (field: keyof RecordingDraft, value: string) => {
    setRecordingDraft((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const saveRecording = async () => {
    if (!selectedCampaign) {
      return
    }

    if (!recordingDraft.title.trim()) {
      setError('Recording title is required')
      return
    }

    setRecordingBusy(true)
    setError(null)
    setPortabilityMessage(null)

    try {
      const durationSeconds = sanitizeDurationSeconds(recordingDraft.durationSeconds)

      await requestRecordingCreate(selectedCampaign.id, {
        title: recordingDraft.title,
        sessionId: recordingDraft.sessionId || undefined,
        roomId: recordingDraft.roomId || undefined,
        sourceUrl: recordingDraft.sourceUrl || undefined,
        storageKey: recordingDraft.storageKey || undefined,
        durationSeconds,
        startedAt: recordingDraft.startedAt || undefined,
        endedAt: recordingDraft.endedAt || undefined,
        journalSummary: recordingDraft.journalSummary || undefined,
        metadata: {
          source: 'admin-console',
        },
      })

      await refreshRecordings(selectedCampaign.id)
      setPortabilityMessage('Recording metadata saved successfully')
      setRecordingDraft((current) => withSessionRoomRetained(current, EMPTY_RECORDING_DRAFT))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recording metadata')
    } finally {
      setRecordingBusy(false)
    }
  }

  return {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    page,
    setPage,
    pageSize,
    setPageSize,
    campaigns,
    total,
    totalPages,
    loading,
    error,
    selectedCampaignId,
    setSelectedCampaignId,
    selectedCampaign,
    roomsLoading,
    roomsError,
    selectedCampaignRooms,
    endingSessionId,
    archivingCampaignId,
    moveBusyUserId,
    selectedMemberId,
    setSelectedMemberId,
    targetRoomId,
    setTargetRoomId,
    recordingsLoading,
    recordingsError,
    recordings,
    recordingBusy,
    exportBusyCampaignId,
    importBusy,
    exportBundleText,
    importBundleText,
    setImportBundleText,
    portabilityMessage,
    recordingDraft,
    endSession,
    toggleArchive,
    movePlayer,
    exportCampaign,
    importCampaign,
    updateRecordingDraft,
    saveRecording,
  }
}
