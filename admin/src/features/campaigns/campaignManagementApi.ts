import { requestJson } from '../../utils/api'
import type {
  CampaignExportResponse,
  CampaignImportResponse,
  CampaignListResponse,
  CampaignRecordingsResponse,
  CampaignRoomsResponse,
  CampaignSummary,
} from './types'

export async function fetchCampaigns(queryString: string): Promise<CampaignListResponse> {
  return requestJson<CampaignListResponse>(`/campaigns?${queryString}`, {
    method: 'GET',
  })
}

export async function fetchCampaignRooms(
  campaignId: string,
  sessionId?: string | null
): Promise<CampaignRoomsResponse> {
  const suffix = sessionId ? `?sessionId=${sessionId}` : ''
  return requestJson<CampaignRoomsResponse>(`/campaigns/${campaignId}/rooms${suffix}`, {
    method: 'GET',
  })
}

export async function fetchCampaignRecordings(
  campaignId: string
): Promise<CampaignRecordingsResponse> {
  return requestJson<CampaignRecordingsResponse>(`/campaigns/${campaignId}/recordings`, {
    method: 'GET',
  })
}

export async function requestSessionEnd(campaign: CampaignSummary, reason: string) {
  if (!campaign.latestSession) {
    return null
  }

  return requestJson<{ message: string }>(
    `/campaigns/${campaign.id}/sessions/${campaign.latestSession.id}/end`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  )
}

export async function requestArchiveToggle(
  campaign: CampaignSummary,
  shouldArchive: boolean,
  reason: string
) {
  return requestJson<{ message: string }>(
    `/campaigns/${campaign.id}/${shouldArchive ? 'archive' : 'restore'}`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  )
}

export async function requestMovePlayer(params: {
  campaignId: string
  sessionId: string
  roomId: string
  targetUserId: string
  reason: string
}) {
  return requestJson<{ message: string }>(
    `/campaigns/${params.campaignId}/sessions/${params.sessionId}/rooms/${params.roomId}/move-player`,
    {
      method: 'POST',
      body: JSON.stringify({
        targetUserId: params.targetUserId,
        reason: params.reason,
      }),
    }
  )
}

export async function requestCampaignExport(campaignId: string): Promise<CampaignExportResponse> {
  return requestJson<CampaignExportResponse>(`/campaigns/${campaignId}/export`, {
    method: 'GET',
  })
}

export async function requestCampaignImport(bundle: unknown): Promise<CampaignImportResponse> {
  return requestJson<CampaignImportResponse>('/campaigns/import', {
    method: 'POST',
    body: JSON.stringify({ bundle }),
  })
}

export async function requestRecordingCreate(
  campaignId: string,
  payload: Record<string, unknown>
): Promise<{ message: string }> {
  return requestJson<{ message: string }>(`/campaigns/${campaignId}/recordings`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
