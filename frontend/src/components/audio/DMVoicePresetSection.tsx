interface AudioPreset {
  id: string
  name: string
}

interface DMVoicePresetSectionProps {
  voicePresets: AudioPreset[]
  selectedVoicePresetName: string
  onVoiceChange: (name: string) => void
  onApply: () => void
  onClear: () => void
  isSubmitting: boolean
}

export function DMVoicePresetSection({
  voicePresets,
  selectedVoicePresetName,
  onVoiceChange,
  onApply,
  onClear,
  isSubmitting,
}: DMVoicePresetSectionProps) {
  return (
    <section className="rounded-ui-md border border-ui-border p-2.5">
      <p className="mb-2 mt-0 font-semibold text-ui-primary">DM Voice Preset</p>
      <div className="grid gap-2">
        <label className="grid gap-1">
          <span className="text-xs text-ui-secondary">Voice</span>
          <select
            aria-label="DM Voice Preset"
            value={selectedVoicePresetName}
            onChange={(event) => onVoiceChange(event.target.value)}
            className="rounded-ui-sm border border-ui-border-soft bg-ui-surface px-2 py-2 text-sm text-ui-primary"
          >
            {voicePresets.map((preset) => (
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
            onClick={onApply}
            className="rounded-ui-sm bg-ui-brand px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Apply DM Voice
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClear}
            className="rounded-ui-sm border border-ui-border px-3 py-1.5 text-sm text-ui-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear DM Voice
          </button>
        </div>
      </div>
    </section>
  )
}
