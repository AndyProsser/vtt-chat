import { CampaignDetail } from '../features/campaigns/CampaignDetail'
import { CampaignListSection } from '../features/campaigns/CampaignListSection'
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
  } = useCampaignManagement()

  return (
    <section className="admin-page campaign-page">
      <h2 className="admin-page-title">Rooms & Campaigns</h2>
      <p className="admin-page-subtitle">
        Operational visibility into campaign sessions, room occupancy, and lifecycle actions.
      </p>

      {error && <p className="admin-inline-error">{error}</p>}
      {portabilityMessage && <p className="admin-inline-success">{portabilityMessage}</p>}

      <CampaignListSection
        search={search}
        statusFilter={statusFilter}
        pageSize={pageSize}
        campaigns={campaigns}
        total={total}
        totalPages={totalPages}
        page={page}
        loading={loading}
        selectedCampaignId={selectedCampaignId}
        endingSessionId={endingSessionId}
        archivingCampaignId={archivingCampaignId}
        onSearchChange={setSearch}
        onStatusFilterChange={setStatusFilter}
        onPageSizeChange={setPageSize}
        onPageChange={setPage}
        onSelectCampaign={setSelectedCampaignId}
        onEndSession={(campaign) => void endSession(campaign)}
        onToggleArchive={(campaign, shouldArchive) => void toggleArchive(campaign, shouldArchive)}
      />

      <CampaignDetail
        selectedCampaign={selectedCampaign}
        selectedCampaignRooms={selectedCampaignRooms}
        roomsLoading={roomsLoading}
        roomsError={roomsError}
        recordingsLoading={recordingsLoading}
        recordingsError={recordingsError}
        recordings={recordings}
        selectedMemberId={selectedMemberId}
        targetRoomId={targetRoomId}
        moveBusyUserId={moveBusyUserId}
        recordingBusy={recordingBusy}
        exportBusyCampaignId={exportBusyCampaignId}
        importBusy={importBusy}
        exportBundleText={exportBundleText}
        importBundleText={importBundleText}
        recordingDraft={recordingDraft}
        onSelectedMemberChange={setSelectedMemberId}
        onTargetRoomChange={setTargetRoomId}
        onImportBundleChange={setImportBundleText}
        onRecordingDraftChange={updateRecordingDraft}
        onMovePlayer={() => void movePlayer()}
        onExportCampaign={(campaign) => void exportCampaign(campaign)}
        onImportCampaign={() => void importCampaign()}
        onSaveRecording={() => void saveRecording()}
      />
    </section>
  )
}
