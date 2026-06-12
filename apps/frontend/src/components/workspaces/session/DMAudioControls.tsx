import { useEffect, useMemo, useState } from 'react'
import type { Role, UUID } from '@shared'
import { Slider } from '@/components/ui'
import { DMEnvironmentSection } from '@/components/workspaces/session/audio/DMEnvironmentSection'
import { DMPlayerOverridesSection } from '@/components/workspaces/session/audio/DMPlayerOverridesSection'
import { DMRoomMovementSection } from '@/components/workspaces/session/audio/DMRoomMovementSection'
import { DMVoicePresetSection } from '@/components/workspaces/session/audio/DMVoicePresetSection'
import { FILTER_PRESETS } from '@/constants/dmAudioControls.constants'
import { useStore } from '@/hooks/useStore'
import { useDMAudioActions } from '@/hooks/session/useDMAudioActions'
import {
  buildParticipantsById,
  getActiveOverrideSummary,
  getSelectedFilterPreset,
} from '@/utils/dmAudioControls'
import type { AudioPreset, DMAudioControlsProps } from '@/types/dmAudioControls'

export function DMAudioControls({
  apiUrl,
  token,
  role,
  sessionId,
  dmUserId,
  rooms,
  participants,
}: DMAudioControlsProps) {
  const dmVoiceMode = useStore((state) => state.dmVoiceMode)
  const dmBackgroundVolume = useStore((state) => state.dmBackgroundVolume)
  const dmVoiceTargetGroupId = useStore((state) => state.dmVoiceTargetGroupId)
  const dmOverrides = useStore((state) => state.dmOverrides)

  const [localVoiceMode, setLocalVoiceMode] = useState<'TARGET_GROUP' | 'BROADCAST'>(dmVoiceMode)
  const [localBackgroundVolume, setLocalBackgroundVolume] = useState(dmBackgroundVolume)
  const [localTargetGroupId, setLocalTargetGroupId] = useState<UUID | ''>(
    dmVoiceTargetGroupId ?? ''
  )

  const [presetOptions, setPresetOptions] = useState<AudioPreset[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<UUID | ''>('')
  const [selectedEnvironmentName, setSelectedEnvironmentName] = useState('')
  const [selectedTargetUserId, setSelectedTargetUserId] = useState<UUID | ''>('')
  const [selectedVoicePresetName, setSelectedVoicePresetName] = useState('')
  const [selectedDistancePresetName, setSelectedDistancePresetName] = useState('')
  const [selectedConditionPresetName, setSelectedConditionPresetName] = useState('')
  const [selectedFilterPresetId, setSelectedFilterPresetId] = useState(FILTER_PRESETS[0]?.id || '')
  const [gainPercent, setGainPercent] = useState(100)
  const [presetError, setPresetError] = useState<string | null>(null)

  const controllableParticipants = useMemo(
    () => participants.filter((p) => p.userId !== dmUserId),
    [participants, dmUserId]
  )

  const environmentPresets = useMemo(
    () => presetOptions.filter((p) => p.category === 'ENVIRONMENT'),
    [presetOptions]
  )
  const voicePresets = useMemo(
    () => presetOptions.filter((p) => p.category === 'VOICE'),
    [presetOptions]
  )
  const distancePresets = useMemo(
    () => presetOptions.filter((p) => p.category === 'DISTANCE'),
    [presetOptions]
  )
  const conditionPresets = useMemo(
    () => presetOptions.filter((p) => p.category === 'CONDITION'),
    [presetOptions]
  )

  const participantsById = useMemo(() => buildParticipantsById(participants), [participants])

  useEffect(() => {
    setSelectedRoomId((previous) => {
      if (previous && rooms.some((r) => r.id === previous)) return previous
      return rooms[0]?.id || ''
    })
  }, [rooms])

  useEffect(() => {
    setSelectedTargetUserId((previous) => {
      if (previous && controllableParticipants.some((p) => p.userId === previous)) return previous
      return controllableParticipants[0]?.userId || ''
    })
  }, [controllableParticipants])

  useEffect(() => {
    let isMounted = true
    const loadPresets = async () => {
      setPresetError(null)
      try {
        const response = await fetch(`${apiUrl}/api/audio/catalog/presets`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) throw new Error('Failed to load audio presets')
        const payload = (await response.json()) as { presets?: AudioPreset[] }
        if (!isMounted) return
        const presets = payload.presets || []
        setPresetOptions(presets)
        const firstEnvironment = presets.find((p) => p.category === 'ENVIRONMENT')
        const firstVoice = presets.find((p) => p.category === 'VOICE')
        const firstDistance = presets.find((p) => p.category === 'DISTANCE')
        const firstCondition = presets.find((p) => p.category === 'CONDITION')
        setSelectedEnvironmentName((prev) => prev || firstEnvironment?.name || '')
        setSelectedVoicePresetName((prev) => prev || firstVoice?.name || '')
        setSelectedDistancePresetName((prev) => prev || firstDistance?.name || '')
        setSelectedConditionPresetName((prev) => prev || firstCondition?.name || '')
      } catch (err) {
        if (!isMounted) return
        setPresetError(err instanceof Error ? err.message : 'Failed to load audio presets')
      }
    }
    void loadPresets()
    return () => {
      isMounted = false
    }
  }, [apiUrl, token])

  const {
    pendingOverrides,
    pendingRoomMoves,
    draggedUserId,
    setDraggedUserId,
    draggedUserIdRef,
    isSubmitting,
    error,
    success,
    playersByRoom,
    applyEnvironment,
    applyOverride,
    removeOverride,
    applyVoiceMode,
    moveParticipantToRoom,
  } = useDMAudioActions({
    apiUrl,
    token,
    role,
    sessionId,
    dmUserId,
    rooms,
    participantsById,
    controllableParticipants,
  })

  if (role !== 'DM') {
    return <p className="m-0 text-sm text-ui-secondary">Audio controls are DM-only.</p>
  }

  const activeOverride = getActiveOverrideSummary(dmOverrides, selectedTargetUserId)
  const selectedFilterPreset = getSelectedFilterPreset(selectedFilterPresetId)

  return (
    <div className="grid gap-3">
      <div>
        <p className="mb-1 mt-0 font-semibold text-ui-primary">DM Voice Bar</p>
        <p className="m-0 text-xs text-ui-secondary">
          First 9.2 slice: room environment + per-player override controls.
        </p>
      </div>

      <DMEnvironmentSection
        rooms={rooms}
        selectedRoomId={selectedRoomId}
        onRoomChange={setSelectedRoomId}
        environmentPresets={environmentPresets}
        selectedEnvironmentName={selectedEnvironmentName}
        onEnvironmentChange={setSelectedEnvironmentName}
        onApply={() => void applyEnvironment(selectedRoomId as UUID, selectedEnvironmentName)}
        isSubmitting={isSubmitting}
      />

      <DMVoicePresetSection
        voicePresets={voicePresets}
        selectedVoicePresetName={selectedVoicePresetName}
        onVoiceChange={setSelectedVoicePresetName}
        onApply={() =>
          void applyOverride(
            'FILTER',
            { presetCategory: 'VOICE', presetName: selectedVoicePresetName },
            dmUserId
          )
        }
        onClear={() => void removeOverride('VOICE', dmUserId)}
        isSubmitting={isSubmitting}
      />

      <DMPlayerOverridesSection
        controllableParticipants={controllableParticipants}
        selectedTargetUserId={selectedTargetUserId}
        onTargetChange={setSelectedTargetUserId}
        gainPercent={gainPercent}
        onGainChange={setGainPercent}
        distancePresets={distancePresets}
        selectedDistancePresetName={selectedDistancePresetName}
        onDistanceChange={setSelectedDistancePresetName}
        conditionPresets={conditionPresets}
        selectedConditionPresetName={selectedConditionPresetName}
        onConditionChange={setSelectedConditionPresetName}
        filterPresets={FILTER_PRESETS}
        selectedFilterPresetId={selectedFilterPresetId}
        onFilterPresetChange={setSelectedFilterPresetId}
        activeOverrideType={activeOverride}
        hasPendingOverride={Boolean(selectedTargetUserId && pendingOverrides[selectedTargetUserId])}
        isSubmitting={isSubmitting}
        onMute={() => void applyOverride('MUTE', undefined, selectedTargetUserId as UUID)}
        onUnmute={() => void removeOverride('MUTE', selectedTargetUserId as UUID)}
        onApplyGain={() =>
          void applyOverride('GAIN', { gain: gainPercent / 100 }, selectedTargetUserId as UUID)
        }
        onClearGain={() => void removeOverride('GAIN', selectedTargetUserId as UUID)}
        onApplyDistance={() =>
          void applyOverride(
            'DISTANCE',
            { presetCategory: 'DISTANCE', presetName: selectedDistancePresetName },
            selectedTargetUserId as UUID
          )
        }
        onClearDistance={() => void removeOverride('DISTANCE', selectedTargetUserId as UUID)}
        onApplyCondition={() =>
          void applyOverride(
            'CONDITION',
            {
              presetCategory: 'CONDITION',
              presetName: selectedConditionPresetName,
              conditionName: selectedConditionPresetName,
            },
            selectedTargetUserId as UUID
          )
        }
        onClearCondition={() => void removeOverride('CONDITION', selectedTargetUserId as UUID)}
        onApplyFilter={() =>
          void applyOverride(
            'FILTER',
            {
              presetCategory: 'FILTER',
              presetName: selectedFilterPreset?.name,
              ...(selectedFilterPreset?.params || {}),
            },
            selectedTargetUserId as UUID
          )
        }
        onClearFilter={() => void removeOverride('FILTER', selectedTargetUserId as UUID)}
      />

      <DMRoomMovementSection
        rooms={rooms}
        playersByRoom={playersByRoom}
        pendingRoomMoves={pendingRoomMoves}
        draggedUserId={draggedUserId}
        onDragStart={(userId) => {
          setDraggedUserId(userId)
          draggedUserIdRef.current = userId
        }}
        onDragEnd={() => {
          window.setTimeout(() => {
            setDraggedUserId(null)
            draggedUserIdRef.current = null
          }, 0)
        }}
        onDrop={(userId, roomId) => {
          const resolvedUserId = userId || draggedUserIdRef.current
          if (resolvedUserId) void moveParticipantToRoom(resolvedUserId, roomId)
          setDraggedUserId(null)
          draggedUserIdRef.current = null
        }}
      />

      <div className="grid gap-2">
        <p className="mb-0 mt-0 font-semibold text-ui-primary text-sm">DM Voice Mode</p>
        <div className="flex gap-2">
          <button
            type="button"
            className={`rounded px-3 py-1 text-sm font-medium ${localVoiceMode === 'TARGET_GROUP' ? 'bg-accent text-white' : 'bg-ui-surface text-ui-secondary border border-ui-border'}`}
            onClick={() => setLocalVoiceMode('TARGET_GROUP')}
          >
            Target Group
          </button>
          <button
            type="button"
            className={`rounded px-3 py-1 text-sm font-medium ${localVoiceMode === 'BROADCAST' ? 'bg-accent text-white' : 'bg-ui-surface text-ui-secondary border border-ui-border'}`}
            onClick={() => setLocalVoiceMode('BROADCAST')}
          >
            Broadcast All
          </button>
        </div>

        {localVoiceMode === 'TARGET_GROUP' && rooms.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ui-secondary" htmlFor="dm-voice-target-group">
              Target Group
            </label>
            <select
              id="dm-voice-target-group"
              className="rounded border border-ui-border bg-ui-surface px-2 py-1 text-sm text-ui-primary"
              value={localTargetGroupId}
              onChange={(e) => setLocalTargetGroupId(e.target.value as UUID | '')}
            >
              <option value="">— select group —</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {localVoiceMode === 'BROADCAST' && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ui-secondary" htmlFor="dm-background-volume">
              Background Volume: {Math.round(localBackgroundVolume * 100)}%
            </label>
            <Slider
              id="dm-background-volume"
              min={0}
              max={1}
              step={0.05}
              value={localBackgroundVolume}
              onValueChange={(nextValue: number) => setLocalBackgroundVolume(nextValue)}
              className="w-full"
            />
          </div>
        )}

        <button
          type="button"
          className="mt-1 w-fit rounded bg-accent px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
          disabled={isSubmitting}
          onClick={() =>
            void applyVoiceMode(localVoiceMode, localBackgroundVolume, localTargetGroupId)
          }
        >
          Apply Voice Mode
        </button>
      </div>

      {error || presetError ? (
        <p className="m-0 text-sm text-ui-error-text" role="alert">
          {error || presetError}
        </p>
      ) : null}
      {success ? (
        <p className="m-0 text-sm text-emerald-700" role="status">
          {success}
        </p>
      ) : null}
    </div>
  )
}
