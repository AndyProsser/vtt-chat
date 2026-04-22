import { AdminPagination } from '../components/AdminPagination'
import { CampaignDetail } from '../features/campaigns/CampaignDetail'
import { CampaignFilters } from '../features/campaigns/CampaignFilters'
import { CampaignTable } from '../features/campaigns/CampaignTable'
import { useCampaignManagement } from '../features/campaigns/useCampaignManagement'
import '../styles/CampaignManagement.css'

export default function CampaignManagement() {
  const {
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
    endSession,
    toggleArchive,
    movePlayer,
  } = useCampaignManagement()

  return (
    <section className="admin-page campaign-page">
      <h2 className="admin-page-title">Rooms & Campaigns</h2>
      <p className="admin-page-subtitle">
        Operational visibility into campaign sessions, room occupancy, and lifecycle actions.
      </p>

      {error && <p className="admin-inline-error">{error}</p>}

      <CampaignFilters
        search={search}
        statusFilter={statusFilter}
        pageSize={pageSize}
        onSearchChange={(value) => {
          setSearch(value)
          setPage(1)
        }}
        onStatusFilterChange={(value) => {
          setStatusFilter(value)
          setPage(1)
        }}
        onPageSizeChange={(value) => {
          setPageSize(value)
          setPage(1)
        }}
      />

      <p className="admin-page-subtitle">
        Showing {campaigns.length} of {total} campaigns (page {page}/{totalPages})
      </p>

      <CampaignTable
        campaigns={campaigns}
        loading={loading}
        selectedCampaignId={selectedCampaignId}
        endingSessionId={endingSessionId}
        archivingCampaignId={archivingCampaignId}
        onSelectCampaign={setSelectedCampaignId}
        onEndSession={(campaign) => void endSession(campaign)}
        onToggleArchive={(campaign, shouldArchive) => void toggleArchive(campaign, shouldArchive)}
      />

      <AdminPagination
        page={page}
        totalPages={totalPages}
        loading={loading}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
      />

      <CampaignDetail
        selectedCampaign={selectedCampaign}
        selectedCampaignRooms={selectedCampaignRooms}
        roomsLoading={roomsLoading}
        roomsError={roomsError}
        selectedMemberId={selectedMemberId}
        targetRoomId={targetRoomId}
        moveBusyUserId={moveBusyUserId}
        onSelectedMemberChange={setSelectedMemberId}
        onTargetRoomChange={setTargetRoomId}
        onMovePlayer={() => void movePlayer()}
      />
    </section>
  )
}
