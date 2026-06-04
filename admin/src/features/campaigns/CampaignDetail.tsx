import { CampaignKVGrid } from './CampaignKVGrid'
import { CampaignMovePlayer } from './CampaignMovePlayer'
import { CampaignRoomGrid } from './CampaignRoomGrid'
import type {
  CampaignRoomsResponse,
  CampaignSummary,
  RecordingDraft,
  RecordingSummary,
} from '@/types/campaigns'

interface CampaignDetailProps {
  selectedCampaign: CampaignSummary | null
  selectedCampaignRooms: CampaignRoomsResponse | null
  roomsLoading: boolean
  roomsError: string | null
  recordingsLoading: boolean
  recordingsError: string | null
  recordings: RecordingSummary[]
  selectedMemberId: string
  targetRoomId: string
  moveBusyUserId: string | null
  recordingBusy: boolean
  exportBusyCampaignId: string | null
  importBusy: boolean
  exportBundleText: string
  importBundleText: string
  importEmailMapText: string
  recordingDraft: RecordingDraft
  onSelectedMemberChange: (memberId: string) => void
  onTargetRoomChange: (roomId: string) => void
  onImportBundleChange: (value: string) => void
  onImportEmailMapChange: (value: string) => void
  onRecordingDraftChange: (field: keyof RecordingDraft, value: string) => void
  onMovePlayer: () => void
  onExportCampaign: (campaign: CampaignSummary) => void
  onImportCampaign: () => void
  onSaveRecording: () => void
}

export function CampaignDetail({
  selectedCampaign,
  selectedCampaignRooms,
  roomsLoading,
  roomsError,
  recordingsLoading,
  recordingsError,
  recordings,
  selectedMemberId,
  targetRoomId,
  moveBusyUserId,
  recordingBusy,
  exportBusyCampaignId,
  importBusy,
  exportBundleText,
  importBundleText,
  importEmailMapText,
  recordingDraft,
  onSelectedMemberChange,
  onTargetRoomChange,
  onImportBundleChange,
  onImportEmailMapChange,
  onRecordingDraftChange,
  onMovePlayer,
  onExportCampaign,
  onImportCampaign,
  onSaveRecording,
}: CampaignDetailProps) {
  return (
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
          <CampaignKVGrid campaign={selectedCampaign} />

          <CampaignRoomGrid
            rooms={
              selectedCampaignRooms ?? {
                campaign: { id: '', name: '' },
                session: null,
                rooms: [],
                members: [],
              }
            }
            loading={roomsLoading}
            error={roomsError}
          />

          <div className="campaign-portability-block">
            <div className="admin-detail-header">
              <h4>Portability</h4>
              <button
                type="button"
                className="admin-button secondary"
                disabled={exportBusyCampaignId === selectedCampaign.id}
                onClick={() => onExportCampaign(selectedCampaign)}
              >
                {exportBusyCampaignId === selectedCampaign.id
                  ? 'Exporting...'
                  : 'Export Campaign JSON'}
              </button>
            </div>

            <label className="campaign-form-label" htmlFor="campaign-export-bundle">
              Export Bundle
            </label>
            <textarea
              id="campaign-export-bundle"
              aria-label="Campaign export bundle"
              className="campaign-bundle-textarea"
              value={exportBundleText}
              readOnly
              placeholder="Exported campaign JSON will appear here."
            />

            <label className="campaign-form-label" htmlFor="campaign-import-bundle">
              Import Bundle
            </label>
            <textarea
              id="campaign-import-bundle"
              aria-label="Campaign import bundle"
              className="campaign-bundle-textarea"
              value={importBundleText}
              onChange={(event) => onImportBundleChange(event.target.value)}
              placeholder="Paste a previously exported campaign bundle to import it as a new campaign."
            />

            <label className="campaign-form-label" htmlFor="campaign-import-email-map">
              Member Email Map{' '}
              <span className="campaign-form-label-hint">(optional — re-links members by email)</span>
            </label>
            <textarea
              id="campaign-import-email-map"
              aria-label="Member email map for import"
              className="campaign-bundle-textarea campaign-bundle-textarea--short"
              value={importEmailMapText}
              onChange={(event) => onImportEmailMapChange(event.target.value)}
              placeholder={'{\n  "player@old-instance.com": "existing-user-uuid"\n}'}
            />

            <div className="campaign-inline-actions">
              <button
                type="button"
                className="admin-button secondary"
                disabled={importBusy}
                onClick={onImportCampaign}
              >
                {importBusy ? 'Importing...' : 'Import As New Campaign'}
              </button>
            </div>
          </div>

          <div className="campaign-recordings-block">
            <div className="admin-detail-header">
              <h4>Recording Metadata</h4>
              {recordingsLoading && <span className="campaign-detail-meta">Loading…</span>}
            </div>

            {recordingsError && (
              <p className="admin-inline-error campaign-room-error">{recordingsError}</p>
            )}

            {!recordings.length ? (
              <p className="campaign-detail-meta">
                No recording metadata saved for this campaign yet.
              </p>
            ) : (
              <div className="campaign-recording-list">
                {recordings.map((recording) => (
                  <article key={recording.id} className="campaign-recording-card">
                    <div className="campaign-recording-card-header">
                      <strong>{recording.title}</strong>
                      <span>
                        {recording.durationSeconds
                          ? `${recording.durationSeconds}s`
                          : 'Duration n/a'}
                      </span>
                    </div>
                    <p>
                      Session: {recording.session?.name || 'Unlinked'} | Room:{' '}
                      {recording.room?.name || 'Unlinked'}
                    </p>
                    <p>{recording.journalSummary || 'No journal summary captured.'}</p>
                  </article>
                ))}
              </div>
            )}

            <div className="campaign-recording-form-grid">
              <label className="campaign-form-label">
                Title
                <input
                  aria-label="Recording title"
                  value={recordingDraft.title}
                  onChange={(event) => onRecordingDraftChange('title', event.target.value)}
                  placeholder="Session 14 main mix"
                />
              </label>

              <label className="campaign-form-label">
                Session
                <select
                  aria-label="Recording session"
                  value={recordingDraft.sessionId}
                  onChange={(event) => onRecordingDraftChange('sessionId', event.target.value)}
                >
                  <option value="">None</option>
                  {selectedCampaignRooms?.session ? (
                    <option value={selectedCampaignRooms.session.id}>
                      {selectedCampaignRooms.session.name}
                    </option>
                  ) : null}
                </select>
              </label>

              <label className="campaign-form-label">
                Room
                <select
                  aria-label="Recording room"
                  value={recordingDraft.roomId}
                  onChange={(event) => onRecordingDraftChange('roomId', event.target.value)}
                >
                  <option value="">None</option>
                  {(selectedCampaignRooms?.rooms || []).map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="campaign-form-label">
                Source URL
                <input
                  aria-label="Recording source URL"
                  value={recordingDraft.sourceUrl}
                  onChange={(event) => onRecordingDraftChange('sourceUrl', event.target.value)}
                  placeholder="https://storage.example/recordings/ashfall-14.opus"
                />
              </label>

              <label className="campaign-form-label">
                Storage Key
                <input
                  aria-label="Recording storage key"
                  value={recordingDraft.storageKey}
                  onChange={(event) => onRecordingDraftChange('storageKey', event.target.value)}
                  placeholder="recordings/ashfall/session-14/main-mix.opus"
                />
              </label>

              <label className="campaign-form-label">
                Duration Seconds
                <input
                  aria-label="Recording duration seconds"
                  value={recordingDraft.durationSeconds}
                  onChange={(event) =>
                    onRecordingDraftChange('durationSeconds', event.target.value)
                  }
                  inputMode="numeric"
                  placeholder="3600"
                />
              </label>

              <label className="campaign-form-label">
                Started At
                <input
                  aria-label="Recording started at"
                  value={recordingDraft.startedAt}
                  onChange={(event) => onRecordingDraftChange('startedAt', event.target.value)}
                  placeholder="2026-04-29T19:30:00.000Z"
                />
              </label>

              <label className="campaign-form-label">
                Ended At
                <input
                  aria-label="Recording ended at"
                  value={recordingDraft.endedAt}
                  onChange={(event) => onRecordingDraftChange('endedAt', event.target.value)}
                  placeholder="2026-04-29T21:30:00.000Z"
                />
              </label>
            </div>

            <label className="campaign-form-label" htmlFor="recording-journal-summary">
              Journal Summary
            </label>
            <textarea
              id="recording-journal-summary"
              aria-label="Recording journal summary"
              className="campaign-bundle-textarea compact"
              value={recordingDraft.journalSummary}
              onChange={(event) => onRecordingDraftChange('journalSummary', event.target.value)}
              placeholder="Capture recap pointers, action items, or archival notes."
            />

            <div className="campaign-inline-actions">
              <button
                type="button"
                className="admin-button secondary"
                disabled={recordingBusy}
                onClick={onSaveRecording}
              >
                {recordingBusy ? 'Saving...' : 'Save Recording Metadata'}
              </button>
            </div>
          </div>

          <CampaignMovePlayer
            rooms={selectedCampaignRooms}
            selectedMemberId={selectedMemberId}
            targetRoomId={targetRoomId}
            moveBusyUserId={moveBusyUserId}
            onSelectedMemberChange={onSelectedMemberChange}
            onTargetRoomChange={onTargetRoomChange}
            onMovePlayer={onMovePlayer}
          />
        </>
      )}
    </section>
  )
}
