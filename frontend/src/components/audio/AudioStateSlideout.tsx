interface AudioStateSlideoutProps {
  open: boolean
  onClose: () => void
  connectionState: 'disconnected' | 'connecting' | 'connected'
  activeRoomName?: string
  participantCount: number
  pttActive: boolean
}

export function AudioStateSlideout({
  open,
  onClose,
  connectionState,
  activeRoomName,
  participantCount,
  pttActive,
}: AudioStateSlideoutProps) {
  if (!open) return null

  return (
    <aside
      aria-label="Audio state"
      className="fixed right-4 top-20 z-30 w-72 rounded-ui-lg border border-ui-border bg-ui-surface p-4 shadow-xl"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold text-ui-primary">Audio State</h3>
        <button
          type="button"
          className="rounded-ui-sm border border-ui-border px-2 py-0.5 text-xs text-ui-secondary"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <dl className="m-0 grid gap-2 text-xs">
        <div>
          <dt className="text-ui-secondary">Connection</dt>
          <dd className="m-0 text-ui-primary">{connectionState}</dd>
        </div>
        <div>
          <dt className="text-ui-secondary">Active Room</dt>
          <dd className="m-0 text-ui-primary">{activeRoomName || 'Not connected'}</dd>
        </div>
        <div>
          <dt className="text-ui-secondary">Participants</dt>
          <dd className="m-0 text-ui-primary">{participantCount}</dd>
        </div>
        <div>
          <dt className="text-ui-secondary">PTT</dt>
          <dd className="m-0 text-ui-primary">{pttActive ? 'Active' : 'Idle'}</dd>
        </div>
      </dl>
    </aside>
  )
}
