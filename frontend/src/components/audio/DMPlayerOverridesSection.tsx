import type { PresenceState, UUID } from '@shared'

interface AudioPreset {
  id: string
  name: string
}

interface FilterPreset {
  id: string
  name: string
  params: Record<string, unknown>
}

interface ParticipantOption {
  userId: UUID
  username: string
  state: PresenceState
}

interface DMPlayerOverridesSectionProps {
  controllableParticipants: ParticipantOption[]
  selectedTargetUserId: UUID | ''
  onTargetChange: (id: UUID | '') => void
  gainPercent: number
  onGainChange: (pct: number) => void
  distancePresets: AudioPreset[]
  selectedDistancePresetName: string
  onDistanceChange: (name: string) => void
  conditionPresets: AudioPreset[]
  selectedConditionPresetName: string
  onConditionChange: (name: string) => void
  filterPresets: FilterPreset[]
  selectedFilterPresetId: string
  onFilterPresetChange: (id: string) => void
  activeOverrideType: string | undefined
  hasPendingOverride: boolean
  isSubmitting: boolean
  onMute: () => void
  onUnmute: () => void
  onApplyGain: () => void
  onClearGain: () => void
  onApplyDistance: () => void
  onClearDistance: () => void
  onApplyCondition: () => void
  onClearCondition: () => void
  onApplyFilter: () => void
  onClearFilter: () => void
}

export function DMPlayerOverridesSection({
  controllableParticipants,
  selectedTargetUserId,
  onTargetChange,
  gainPercent,
  onGainChange,
  distancePresets,
  selectedDistancePresetName,
  onDistanceChange,
  conditionPresets,
  selectedConditionPresetName,
  onConditionChange,
  filterPresets,
  selectedFilterPresetId,
  onFilterPresetChange,
  activeOverrideType,
  hasPendingOverride,
  isSubmitting,
  onMute,
  onUnmute,
  onApplyGain,
  onClearGain,
  onApplyDistance,
  onClearDistance,
  onApplyCondition,
  onClearCondition,
  onApplyFilter,
  onClearFilter,
}: DMPlayerOverridesSectionProps) {
  const selectedFilterPreset =
    filterPresets.find((p) => p.id === selectedFilterPresetId) || filterPresets[0]

  return (
    <section className="rounded-ui-md border border-ui-border p-2.5">
      <p className="mb-2 mt-0 font-semibold text-ui-primary">Player Overrides</p>
      <div className="grid gap-2">
        <label className="grid gap-1">
          <span className="text-xs text-ui-secondary">Target Player</span>
          <select
            aria-label="Override Target"
            value={selectedTargetUserId}
            onChange={(event) => onTargetChange(event.target.value as UUID | '')}
            className="rounded-ui-sm border border-ui-border-soft bg-ui-surface px-2 py-2 text-sm text-ui-primary"
          >
            {controllableParticipants.map((participant) => (
              <option key={participant.userId} value={participant.userId}>
                {participant.username} ({participant.state})
              </option>
            ))}
          </select>
        </label>

        <div className="inline-flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onMute}
            className="rounded-ui-sm bg-ui-brand px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Mute
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onUnmute}
            className="rounded-ui-sm border border-ui-border px-3 py-1.5 text-sm text-ui-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Unmute
          </button>
        </div>

        <label className="grid gap-1">
          <span className="text-xs text-ui-secondary">Gain ({gainPercent}%)</span>
          <input
            aria-label="Override Gain"
            type="range"
            min={25}
            max={200}
            step={5}
            value={gainPercent}
            onChange={(event) => onGainChange(Number(event.target.value))}
            className="accent-sky-600"
          />
        </label>

        <div className="inline-flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onApplyGain}
            className="rounded-ui-sm bg-ui-brand px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Apply Gain
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClearGain}
            className="rounded-ui-sm border border-ui-border px-3 py-1.5 text-sm text-ui-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear Gain
          </button>
        </div>

        <label className="grid gap-1">
          <span className="text-xs text-ui-secondary">Distance preset</span>
          <select
            aria-label="Distance Preset"
            value={selectedDistancePresetName}
            onChange={(event) => onDistanceChange(event.target.value)}
            className="rounded-ui-sm border border-ui-border-soft bg-ui-surface px-2 py-2 text-sm text-ui-primary"
          >
            {distancePresets.map((preset) => (
              <option key={preset.id} value={preset.name}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>

        <div className="inline-flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onApplyDistance}
            className="rounded-ui-sm bg-ui-brand px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Apply Distance
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClearDistance}
            className="rounded-ui-sm border border-ui-border px-3 py-1.5 text-sm text-ui-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear Distance
          </button>
        </div>

        <label className="grid gap-1">
          <span className="text-xs text-ui-secondary">Condition preset</span>
          <select
            aria-label="Condition Preset"
            value={selectedConditionPresetName}
            onChange={(event) => onConditionChange(event.target.value)}
            className="rounded-ui-sm border border-ui-border-soft bg-ui-surface px-2 py-2 text-sm text-ui-primary"
          >
            {conditionPresets.map((preset) => (
              <option key={preset.id} value={preset.name}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>

        <div className="inline-flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onApplyCondition}
            className="rounded-ui-sm bg-ui-brand px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Apply Condition
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClearCondition}
            className="rounded-ui-sm border border-ui-border px-3 py-1.5 text-sm text-ui-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear Condition
          </button>
        </div>

        <label className="grid gap-1">
          <span className="text-xs text-ui-secondary">Filter preset</span>
          <select
            aria-label="Filter Preset"
            value={selectedFilterPresetId}
            onChange={(event) => onFilterPresetChange(event.target.value)}
            className="rounded-ui-sm border border-ui-border-soft bg-ui-surface px-2 py-2 text-sm text-ui-primary"
          >
            {filterPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>

        <div className="inline-flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isSubmitting || !selectedFilterPreset}
            onClick={onApplyFilter}
            className="rounded-ui-sm bg-ui-brand px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Apply Filter
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClearFilter}
            className="rounded-ui-sm border border-ui-border px-3 py-1.5 text-sm text-ui-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear Filter
          </button>
        </div>

        <p className="m-0 text-xs text-ui-secondary">
          Active override: <strong>{activeOverrideType ?? 'None'}</strong>
        </p>
        {hasPendingOverride ? (
          <p className="m-0 text-xs text-amber-700">
            Pending sync: waiting for websocket reconciliation.
          </p>
        ) : null}
      </div>
    </section>
  )
}
