interface EnvironmentPreset {
  id: string
  label: string
  description?: string
}

interface EnvironmentPanelProps {
  presets: EnvironmentPreset[]
  activePresetId?: string
  disabled?: boolean
  onSelectPreset: (presetId: string) => void
}

export function EnvironmentPanel({
  presets,
  activePresetId,
  disabled = false,
  onSelectPreset,
}: EnvironmentPanelProps) {
  return (
    <section className="rounded-ui-md border border-ui-border bg-ui-surface p-3">
      <h4 className="m-0 text-sm font-semibold text-ui-primary">Environment</h4>
      <p className="mt-1 text-xs text-ui-secondary">Apply room-wide ambience presets.</p>
      <div className="mt-2 grid gap-2">
        {presets.map((preset) => {
          const active = preset.id === activePresetId
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              className={`rounded-ui-sm border px-3 py-2 text-left text-sm ${
                active
                  ? 'border-ui-accent bg-ui-surface-subtle text-ui-primary'
                  : 'border-ui-border bg-ui-surface text-ui-secondary'
              }`}
              onClick={() => onSelectPreset(preset.id)}
            >
              <p className="m-0 font-semibold">{preset.label}</p>
              {preset.description ? <p className="m-0 mt-1 text-xs">{preset.description}</p> : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
