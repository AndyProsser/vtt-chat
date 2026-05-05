import type { RoomType, UUID } from '@shared'

interface AudioRoomOption {
  id: UUID
  name: string
  type: RoomType
}

interface AudioPreset {
  id: string
  name: string
}

interface DMEnvironmentSectionProps {
  rooms: AudioRoomOption[]
  selectedRoomId: UUID | ''
  onRoomChange: (id: UUID | '') => void
  environmentPresets: AudioPreset[]
  selectedEnvironmentName: string
  onEnvironmentChange: (name: string) => void
  onApply: () => void
  isSubmitting: boolean
}

export function DMEnvironmentSection({
  rooms,
  selectedRoomId,
  onRoomChange,
  environmentPresets,
  selectedEnvironmentName,
  onEnvironmentChange,
  onApply,
  isSubmitting,
}: DMEnvironmentSectionProps) {
  return (
    <section className="rounded-ui-md border border-ui-border p-2.5">
      <p className="mb-2 mt-0 font-semibold text-ui-primary">Room Environment</p>
      <div className="grid gap-2">
        <label className="grid gap-1">
          <span className="text-xs text-ui-secondary">Room</span>
          <select
            aria-label="Audio Room"
            value={selectedRoomId}
            onChange={(event) => onRoomChange(event.target.value as UUID | '')}
            className="rounded-ui-sm border border-ui-border-soft bg-ui-surface px-2 py-2 text-sm text-ui-primary"
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} ({room.type})
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-ui-secondary">Environment</span>
          <select
            aria-label="Environment Preset"
            value={selectedEnvironmentName}
            onChange={(event) => onEnvironmentChange(event.target.value)}
            className="rounded-ui-sm border border-ui-border-soft bg-ui-surface px-2 py-2 text-sm text-ui-primary"
          >
            {environmentPresets.map((preset) => (
              <option key={preset.id} value={preset.name}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={onApply}
          className="w-fit rounded-ui-sm bg-ui-brand px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          Apply Environment
        </button>
      </div>
    </section>
  )
}
