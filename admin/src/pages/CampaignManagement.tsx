import { useEffect, useMemo, useState } from 'react'
import { requestJson } from '../utils/api'
import '../styles/CampaignManagement.css'

type SessionState = 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED'
type CampaignStatusFilter = 'all' | 'active' | 'idle' | 'ended' | 'no_session'

interface CampaignSummary {
  id: string
  name: string
  description: string | null
  isArchived?: boolean
  inviteCode: string
  currentDmId: string
  currentDm: {
    id: string
    username: string
  }
  memberCount: number
  sessionCount: number
  latestSession: {
    id: string
    name: string
    state: SessionState
    createdAt: string
    startedAt: string | null
    endedAt: string | null
    updatedAt: string
    _count: {
      rooms: number
      members: number
    }
  } | null
  createdAt: string
  updatedAt: string
}

interface CampaignListResponse {
  campaigns: CampaignSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface CampaignRoomsResponse {
  campaign: {
    id: string
    name: string
  }
  session: {
    id: string
    name: string
    state: SessionState
    updatedAt: string
  } | null
  rooms: Array<{
    id: string
    name: string
    type: 'MAIN' | 'GROUP' | 'PRIVATE'
    createdAt: string
    updatedAt: string
    occupantCount: number
  }>
  members?: Array<{
    userId: string
    username: string
    role: 'DM' | 'PLAYER' | 'SPECTATOR' | 'SYSTEM'
    primaryRoomId: string | null
    presenceState: string
  }>
}

function prettyState(state: SessionState): string {
  if (state === 'IDLE') return 'Idle'
  if (state === 'ACTIVE') return 'Active'
  if (state === 'PAUSED') return 'Paused'
  return 'Ended'
}

function statusClass(state: SessionState | 'NO_SESSION'): string {
  if (state === 'ACTIVE') return 'status-active'
  if (state === 'PAUSED') return 'status-paused'
  if (state === 'ENDED') return 'status-ended'
  if (state === 'IDLE') return 'status-idle'
  return 'status-none'
}

export default function CampaignManagement() {
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
  const [selectedMemberId, setSelectedMemberId] = useState<string>('')
  const [targetRoomId, setTargetRoomId] = useState<string>('')

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      search,
      status: statusFilter,
      page: String(page),
      pageSize: String(pageSize),
    })
    return params.toString()
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
        const response = await requestJson<CampaignListResponse>(`/campaigns?${queryString}`, {
          method: 'GET',
        })

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
        const response = await requestJson<CampaignRoomsResponse>(
          `/campaigns/${selectedCampaign.id}/rooms${
            selectedCampaign.latestSession ? `?sessionId=${selectedCampaign.latestSession.id}` : ''
          }`,
          {
            method: 'GET',
          }
        )

        const members = response.members || []
        const rooms = response.rooms || []

        if (members.length && rooms.length) {
          const preferredMember = members.find((member) => member.role !== 'DM') || members[0]
          const nextMemberId = selectedMemberId || preferredMember.userId
          const member = members.find((item) => item.userId === nextMemberId) || preferredMember
          const roomForMember =
            rooms.find((room) => room.id === member.primaryRoomId)?.id ||
            rooms.find((room) => room.id !== member.primaryRoomId)?.id ||
            rooms[0].id

          if (!selectedMemberId) {
            setSelectedMemberId(nextMemberId)
          }
          if (!targetRoomId) {
            setTargetRoomId(roomForMember)
          }
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

  const refreshCampaigns = async () => {
    const refreshed = await requestJson<CampaignListResponse>(`/campaigns?${queryString}`, {
      method: 'GET',
    })

    setCampaigns(refreshed.campaigns)
    setTotal(refreshed.total)
    setTotalPages(refreshed.totalPages)
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

    try {
      await requestJson<{ message: string }>(
        `/campaigns/${campaign.id}/sessions/${campaign.latestSession.id}/end`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'Admin operation: ended from Rooms & Campaigns page' }),
        }
      )
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

    try {
      await requestJson<{ message: string }>(
        `/campaigns/${campaign.id}/${shouldArchive ? 'archive' : 'restore'}`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: `Admin operation: ${actionLabel} campaign` }),
        }
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
    if (!member) {
      return
    }

    if (member.primaryRoomId === targetRoomId) {
      return
    }

    setMoveBusyUserId(member.userId)
    setError(null)

    try {
      await requestJson<{ message: string }>(
        `/campaigns/${selectedCampaign.id}/sessions/${selectedCampaignRooms.session.id}/rooms/${targetRoomId}/move-player`,
        {
          method: 'POST',
          body: JSON.stringify({
            targetUserId: member.userId,
            reason: 'Admin operation: move player from campaign control panel',
          }),
        }
      )

      const refreshedRooms = await requestJson<CampaignRoomsResponse>(
        `/campaigns/${selectedCampaign.id}/rooms?sessionId=${selectedCampaignRooms.session.id}`,
        {
          method: 'GET',
        }
      )

      setSelectedCampaignRooms(refreshedRooms)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move player')
    } finally {
      setMoveBusyUserId(null)
    }
  }

  return (
    <section className="admin-page campaign-page">
      <h2 className="admin-page-title">Rooms & Campaigns</h2>
      <p className="admin-page-subtitle">
        Operational visibility into campaign sessions, room occupancy, and lifecycle actions.
      </p>

      {error && <p className="admin-inline-error">{error}</p>}

      <div className="admin-toolbar-row wrap">
        <input
          type="search"
          placeholder="Search campaigns, invite codes, or DM"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />

        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as CampaignStatusFilter)
            setPage(1)
          }}
        >
          <option value="all">All session states</option>
          <option value="active">Active sessions</option>
          <option value="idle">Idle or paused sessions</option>
          <option value="ended">Ended sessions</option>
          <option value="no_session">No sessions yet</option>
        </select>

        <select
          value={String(pageSize)}
          onChange={(event) => {
            setPageSize(Number(event.target.value))
            setPage(1)
          }}
        >
          <option value="10">10 / page</option>
          <option value="20">20 / page</option>
          <option value="50">50 / page</option>
        </select>
      </div>

      <p className="admin-page-subtitle">
        Showing {campaigns.length} of {total} campaigns (page {page}/{totalPages})
      </p>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>DM</th>
              <th>Members</th>
              <th>Latest Session</th>
              <th>State</th>
              <th>Rooms</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>Loading campaigns...</td>
              </tr>
            ) : campaigns.length === 0 ? (
              <tr>
                <td colSpan={7}>No campaigns matched the current filter.</td>
              </tr>
            ) : (
              campaigns.map((campaign) => {
                const latestState = campaign.latestSession?.state || 'NO_SESSION'
                const isBusy = endingSessionId === campaign.latestSession?.id
                const isArchiveBusy = archivingCampaignId === campaign.id
                return (
                  <tr
                    key={campaign.id}
                    className={selectedCampaignId === campaign.id ? 'campaign-row-selected' : ''}
                  >
                    <td>
                      <div className="campaign-name">{campaign.name}</div>
                      <div className="campaign-meta">Invite: {campaign.inviteCode}</div>
                    </td>
                    <td>{campaign.currentDm.username}</td>
                    <td>{campaign.memberCount}</td>
                    <td>{campaign.latestSession?.name || '—'}</td>
                    <td>
                      {campaign.isArchived ? <span className="archived-pill">Archived</span> : null}
                      <span className={`status-pill ${statusClass(latestState)}`}>
                        {latestState === 'NO_SESSION' ? 'No Session' : prettyState(latestState)}
                      </span>
                    </td>
                    <td>{campaign.latestSession?._count.rooms || 0}</td>
                    <td>
                      <div className="cell-actions">
                        <button
                          className="admin-btn admin-btn-ghost"
                          onClick={() => setSelectedCampaignId(campaign.id)}
                        >
                          View
                        </button>
                        <button
                          className="admin-btn admin-btn-ghost"
                          onClick={() => void endSession(campaign)}
                          disabled={
                            !campaign.latestSession ||
                            campaign.latestSession.state === 'ENDED' ||
                            isBusy
                          }
                        >
                          {isBusy ? 'Ending...' : 'End Session'}
                        </button>
                        <button
                          className="admin-btn admin-btn-ghost"
                          onClick={() => void toggleArchive(campaign, !campaign.isArchived)}
                          disabled={isArchiveBusy}
                        >
                          {isArchiveBusy
                            ? campaign.isArchived
                              ? 'Restoring...'
                              : 'Archiving...'
                            : campaign.isArchived
                              ? 'Restore'
                              : 'Archive'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-pagination">
        <button
          className="admin-btn admin-btn-ghost"
          disabled={page <= 1 || loading}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          className="admin-btn admin-btn-ghost"
          disabled={page >= totalPages || loading}
          onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
        >
          Next
        </button>
      </div>

      <section className="admin-card campaign-detail-card">
        <div className="admin-detail-header">
          <h3>Selected Campaign Detail</h3>
          {selectedCampaign && (
            <span className="campaign-detail-meta">DM: {selectedCampaign.currentDm.username}</span>
          )}
        </div>

        {!selectedCampaign ? (
          <p className="admin-page-subtitle">Select a campaign to inspect rooms and occupancy.</p>
        ) : (
          <>
            <div className="kv-grid campaign-kv-grid">
              <div>
                <strong>Campaign:</strong> {selectedCampaign.name}
              </div>
              <div>
                <strong>Invite Code:</strong> {selectedCampaign.inviteCode}
              </div>
              <div>
                <strong>Members:</strong> {selectedCampaign.memberCount}
              </div>
              <div>
                <strong>Total Sessions:</strong> {selectedCampaign.sessionCount}
              </div>
              <div>
                <strong>Lifecycle:</strong> {selectedCampaign.isArchived ? 'Archived' : 'Active'}
              </div>
            </div>

            {roomsError && <p className="admin-inline-error campaign-room-error">{roomsError}</p>}

            <div className="campaign-rooms-block">
              <h4 className="campaign-rooms-title">
                {selectedCampaignRooms?.session
                  ? `Rooms in session: ${selectedCampaignRooms.session.name}`
                  : 'No session rooms available'}
              </h4>

              {roomsLoading ? (
                <p className="admin-inline-status">Loading room occupancy...</p>
              ) : selectedCampaignRooms?.rooms.length ? (
                <div className="campaign-room-grid">
                  {selectedCampaignRooms.rooms.map((room) => (
                    <article key={room.id} className="campaign-room-card">
                      <div className="campaign-room-card-header">
                        <strong>{room.name}</strong>
                        <span>{room.type}</span>
                      </div>
                      <p>Occupants: {room.occupantCount}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="admin-page-subtitle">
                  No rooms found for the selected campaign session.
                </p>
              )}
            </div>

            <div className="campaign-move-player-block">
              <h4 className="campaign-rooms-title">Move Player Between Rooms</h4>
              <div className="campaign-move-player-controls">
                <select
                  value={selectedMemberId}
                  onChange={(event) => setSelectedMemberId(event.target.value)}
                  aria-label="Select player to move"
                >
                  {(selectedCampaignRooms?.members || []).map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.username} ({member.role})
                    </option>
                  ))}
                </select>

                <select
                  value={targetRoomId}
                  onChange={(event) => setTargetRoomId(event.target.value)}
                  aria-label="Select destination room"
                >
                  {(selectedCampaignRooms?.rooms || []).map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name} ({room.type})
                    </option>
                  ))}
                </select>

                <button
                  className="admin-btn admin-btn-ghost"
                  onClick={() => void movePlayer()}
                  disabled={
                    !selectedCampaignRooms?.session ||
                    !selectedMemberId ||
                    !targetRoomId ||
                    Boolean(moveBusyUserId)
                  }
                >
                  {moveBusyUserId ? 'Moving...' : 'Move Player'}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </section>
  )
}
