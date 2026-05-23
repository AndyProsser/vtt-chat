import { useCallback } from 'react'
import type { UUID } from '@shared'
import type { Session as SessionRecord } from '@/types/session'

interface UseCampaignSessionsDataFetcherParams {
  apiUrl: string
  token: string
  fetchWithAuthGuard: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

/**
 * Returns a memoized campaign sessions loader used by workspace initialization flows.
 */
export function useCampaignSessionsDataFetcher({
  apiUrl,
  token,
  fetchWithAuthGuard,
}: UseCampaignSessionsDataFetcherParams) {
  return useCallback(
    async (campaignId: UUID): Promise<SessionRecord[]> => {
      const response = await fetchWithAuthGuard(`${apiUrl}/api/campaigns/${campaignId}/sessions`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to fetch campaign sessions')
      }

      const data = await response.json()
      return (data.sessions || []) as SessionRecord[]
    },
    [apiUrl, fetchWithAuthGuard, token]
  )
}
