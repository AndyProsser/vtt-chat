/**
 * Groups Panel API Service
 * Handles API calls for campaign groups and session groups management.
 */

import type { UUID } from '@shared'
import { logger } from '@/utils/logger'
import type { CampaignGroup } from '@/state/campaignGroupsSlice'
import type { Room } from '@/types/room'

// ─────────────────────────────────────────────────────────────────────────────
// Campaign Groups (Persistent)
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchCampaignGroups(
  campaignId: UUID,
  token: string,
  apiUrl: string
): Promise<CampaignGroup[]> {
  try {
    const res = await fetch(`${apiUrl}/api/campaigns/${campaignId}/groups`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to fetch campaign groups: ${res.status}`)
    }

    const data = await res.json()
    return data.groups || []
  } catch (err) {
    logger.error('groupsPanel.service', 'Failed to fetch campaign groups', err)
    throw err
  }
}

export async function createCampaignGroup(
  campaignId: UUID,
  name: string,
  defaultEnvironmentName: string | undefined,
  token: string,
  apiUrl: string
): Promise<CampaignGroup> {
  try {
    const res = await fetch(`${apiUrl}/api/campaigns/${campaignId}/groups`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        type: 'GROUP',
        defaultEnvironmentName,
      }),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      throw new Error(errorData.message || `Failed to create campaign group: ${res.status}`)
    }

    const data = await res.json()
    return data.group
  } catch (err) {
    logger.error('groupsPanel.service', 'Failed to create campaign group', err)
    throw err
  }
}

export async function updateCampaignGroupEnvironment(
  campaignId: UUID,
  groupId: UUID,
  defaultEnvironmentName: string | undefined,
  token: string,
  apiUrl: string
): Promise<CampaignGroup> {
  try {
    const res = await fetch(`${apiUrl}/api/campaigns/${campaignId}/groups/${groupId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ defaultEnvironmentName }),
    })

    if (!res.ok) {
      throw new Error(`Failed to update campaign group: ${res.status}`)
    }

    const data = await res.json()
    return data.group
  } catch (err) {
    logger.error('groupsPanel.service', 'Failed to update campaign group', err)
    throw err
  }
}

export async function deleteCampaignGroup(
  campaignId: UUID,
  groupId: UUID,
  token: string,
  apiUrl: string
): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl}/api/campaigns/${campaignId}/groups/${groupId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      throw new Error(errorData.message || `Failed to delete campaign group: ${res.status}`)
    }

    return true
  } catch (err) {
    logger.error('groupsPanel.service', 'Failed to delete campaign group', err)
    throw err
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Session Groups (Runtime)
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchSessionGroups(
  sessionId: UUID,
  token: string,
  apiUrl: string
): Promise<Room[]> {
  try {
    const res = await fetch(`${apiUrl}/api/sessions/${sessionId}/groups`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to fetch session groups: ${res.status}`)
    }

    const data = await res.json()
    return data.groups || []
  } catch (err) {
    logger.error('groupsPanel.service', 'Failed to fetch session groups', err)
    throw err
  }
}

export interface CloseGroupResponse {
  ok: boolean
  closedGroupId: UUID
  movedUsers: Array<{ userId: UUID; username: string; fromGroupId: UUID; toGroupId: UUID }>
}

export async function closeGroup(
  sessionId: UUID,
  groupId: UUID,
  token: string,
  apiUrl: string
): Promise<CloseGroupResponse> {
  try {
    const res = await fetch(`${apiUrl}/api/sessions/${sessionId}/groups/${groupId}/close`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      throw new Error(errorData.message || `Failed to close group: ${res.status}`)
    }

    return await res.json()
  } catch (err) {
    logger.error('groupsPanel.service', 'Failed to close group', err)
    throw err
  }
}

export interface DeleteGroupResponse {
  ok: boolean
  deletedGroupId: UUID
}

export async function deleteGroup(
  sessionId: UUID,
  groupId: UUID,
  force: boolean = false,
  token: string,
  apiUrl: string
): Promise<DeleteGroupResponse> {
  try {
    const res = await fetch(`${apiUrl}/api/sessions/${sessionId}/groups/${groupId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ force }),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      throw new Error(errorData.message || `Failed to delete group: ${res.status}`)
    }

    return await res.json()
  } catch (err) {
    logger.error('groupsPanel.service', 'Failed to delete group', err)
    throw err
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Group Environments (Session-level)
// ─────────────────────────────────────────────────────────────────────────────

export interface ApplyEnvironmentResponse {
  ok: boolean
  groupId: UUID
  environmentName: string
}

export async function applyGroupEnvironment(
  sessionId: UUID,
  groupId: UUID,
  environmentName: string,
  token: string,
  apiUrl: string
): Promise<ApplyEnvironmentResponse> {
  try {
    const res = await fetch(`${apiUrl}/api/audio/environments/apply`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        groupId,
        environmentName,
      }),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      throw new Error(errorData.message || `Failed to apply environment: ${res.status}`)
    }

    return await res.json()
  } catch (err) {
    logger.error('groupsPanel.service', 'Failed to apply environment', err)
    throw err
  }
}

export async function clearGroupEnvironment(
  groupId: UUID,
  token: string,
  apiUrl: string
): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl}/api/audio/environments/${groupId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to clear environment: ${res.status}`)
    }

    return true
  } catch (err) {
    logger.error('groupsPanel.service', 'Failed to clear environment', err)
    throw err
  }
}
