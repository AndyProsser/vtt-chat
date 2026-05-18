import { AUDIO_CONTROL_COPY, getDMVoiceChannelButtonLabel } from '../../constants/audioUi.constants'
import { Slider } from '../../core-ui'

interface DMVoicePanelProps {
  isEnabled: boolean
  gain: number
  muted: boolean
  onEnabledChange: (enabled: boolean) => void
  onGainChange: (gain: number) => void
  onMutedChange: (muted: boolean) => void
}

export function DMVoicePanel({
  isEnabled,
  gain,
  muted,
  onEnabledChange,
  onGainChange,
  onMutedChange,
}: DMVoicePanelProps) {
  return (
    <section className="rounded-ui-md border border-ui-border bg-ui-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="m-0 text-sm font-semibold text-ui-primary">
          {AUDIO_CONTROL_COPY.dmVoiceOverride}
        </h4>
        <label className="flex items-center gap-2 text-xs text-ui-secondary">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
          />
          Enabled
        </label>
      </div>

      <label className="mt-3 block text-xs text-ui-secondary">
        Gain ({Math.round(gain * 100)}%)
        <Slider
          className="mt-1 w-full"
          min={0}
          max={2}
          step={0.05}
          value={gain}
          disabled={!isEnabled}
          onValueChange={(nextValue) => onGainChange(nextValue)}
        />
      </label>

      <button
        type="button"
        disabled={!isEnabled}
        className="mt-3 rounded-ui-sm border border-ui-border bg-ui-surface-subtle px-3 py-1.5 text-xs text-ui-primary"
        onClick={() => onMutedChange(!muted)}
      >
        {getDMVoiceChannelButtonLabel(muted)}
      </button>
    </section>
  )
}
