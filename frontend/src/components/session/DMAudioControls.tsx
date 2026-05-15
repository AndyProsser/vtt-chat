import { useEffect, useMemo, useRef, useState } from 'react'
import type { PresenceState, Role, RoomType, UUID } from '@shared'
import { DMEnvironmentSection } from '../audio/DMEnvironmentSection'
import { DMPlayerOverridesSection } from '../audio/DMPlayerOverridesSection'
import { DMRoomMovementSection } from '../audio/DMRoomMovementSection'
import { DMVoicePresetSection } from '../audio/DMVoicePresetSection'
import {
  FILTER_PRESETS,
  OVERRIDE_CONFIRMATION_TIMEOUT_MS,
  ROOM_MOVE_CONFIRMATION_TIMEOUT_MS,
} from '../../constants/dmAudioControls.constants'
import { useStore } from '../../hooks/useStore'
import { getUserDMOverride } from '@/utils/audioOverrides'
import { telemetryClient } from '../../utils/telemetry'
import {
  buildParticipantRoomById,
  buildParticipantsById,
  buildPlayersByRoom,
  getActiveOverrideSummary,
  getSelectedFilterPreset,
} from '@/utils/dmAudioControls'
import type {
  AudioPreset,
  DMAudioControlsProps,
  PendingMove,
  PendingOverride,
} from '@/types/dmAudioControls'

export function DMAudioControls({
  apiUrl,
  token,
  role,
  sessionId,
  dmUserId,
  rooms,
  participants,
}: DMAudioControlsProps) {
  const dmOverrides = useStore((state) => state.dmOverrides)
  const setDMOverride = useStore((state) => state.setDMOverride)
  const removeDMOverride = useStore((state) => state.removeDMOverride)
  const dmVoiceMode = useStore((state) => state.dmVoiceMode)
  const dmBackgroundVolume = useStore((state) => state.dmBackgroundVolume)
  const dmVoiceTargetGroupId = useStore((state) => state.dmVoiceTargetGroupId)

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
  const [pendingOverrides, setPendingOverrides] = useState<Record<UUID, PendingOverride>>({})
  const [pendingRoomMoves, setPendingRoomMoves] = useState<Record<UUID, PendingMove>>({})
  const [draggedUserId, setDraggedUserId] = useState<UUID | null>(null)
  const draggedUserIdRef = useRef<UUID | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const controllableParticipants = useMemo(
    () => participants.filter((participant) => participant.userId !== dmUserId),
    [participants, dmUserId]
  )

  const environmentPresets = useMemo(
    () => presetOptions.filter((preset) => preset.category === 'ENVIRONMENT'),
    [presetOptions]
  )
  const voicePresets = useMemo(
    () => presetOptions.filter((preset) => preset.category === 'VOICE'),
    [presetOptions]
  )
  const distancePresets = useMemo(
    () => presetOptions.filter((preset) => preset.category === 'DISTANCE'),
    [presetOptions]
  )
  const conditionPresets = useMemo(
    () => presetOptions.filter((preset) => preset.category === 'CONDITION'),
    [presetOptions]
  )

  const participantsById = useMemo(() => buildParticipantsById(participants), [participants])

  useEffect(() => {
    setSelectedRoomId((previous) => {
      if (previous && rooms.some((room) => room.id === previous)) {
        return previous
      }

      return rooms[0]?.id || ''
    })
  }, [rooms])

  useEffect(() => {
    setSelectedTargetUserId((previous) => {
      if (
        previous &&
        controllableParticipants.some((participant) => participant.userId === previous)
      ) {
        return previous
      }

      return controllableParticipants[0]?.userId || ''
    })
  }, [controllableParticipants])

  useEffect(() => {
    let isMounted = true

    const loadPresets = async () => {
      setError(null)
      try {
        const response = await fetch(`${apiUrl}/api/audio/catalog/presets`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          throw new Error('Failed to load audio presets')
        }

        const payload = (await response.json()) as { presets?: AudioPreset[] }
        if (!isMounted) {
          return
        }

        const presets = payload.presets || []
        setPresetOptions(presets)

        const firstEnvironment = presets.find((preset) => preset.category === 'ENVIRONMENT')
        const firstVoice = presets.find((preset) => preset.category === 'VOICE')
        const firstDistance = presets.find((preset) => preset.category === 'DISTANCE')
        const firstCondition = presets.find((preset) => preset.category === 'CONDITION')
        setSelectedEnvironmentName((previous) => previous || firstEnvironment?.name || '')
        setSelectedVoicePresetName((previous) => previous || firstVoice?.name || '')
        setSelectedDistancePresetName((previous) => previous || firstDistance?.name || '')
        setSelectedConditionPresetName((previous) => previous || firstCondition?.name || '')
      } catch (err) {
        if (!isMounted) {
          return
        }

        setError(err instanceof Error ? err.message : 'Failed to load audio presets')
      }
    }

    void loadPresets()

    return () => {
      isMounted = false
    }
  }, [apiUrl, token])

  const postJson = async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(`${apiUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string }
      throw new Error(payload.message || 'Audio control request failed')
    }
  }

  const applyEnvironment = async () => {
    if (!selectedRoomId || !selectedEnvironmentName) {
      setError('Select a room and environment preset first.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      await postJson('/api/audio/environments/apply', {
        sessionId,
        roomId: selectedRoomId,
        environmentName: selectedEnvironmentName,
      })
      telemetryClient.track('AUDIO_ENVIRONMENT_SET', {
        sessionId,
        roomId: selectedRoomId,
        environmentName: selectedEnvironmentName,
        role,
      })
      setSuccess(`Applied ${selectedEnvironmentName} to selected room.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply environment')
    } finally {
      setIsSubmitting(false)
    }
  }

  const applyOverride = async (
    overrideType:
      | 'MUTE'
      | 'UNMUTE'
      | 'GAIN'
      | 'GATE'
      | 'FILTER'
      | 'DISTANCE'
      | 'CONDITION'
      | 'VOICE',
    parameters?: Record<string, unknown>,
    targetUserId?: UUID
  ) => {
    const resolvedTargetUserId = targetUserId || selectedTargetUserId
    if (!resolvedTargetUserId) {
      setError('Select a participant first.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)
    const expectedAppliedAt = Date.now()
    const pendingEntry: PendingOverride = {
      userId: resolvedTargetUserId,
      overrideType,
      expectedAppliedAt,
      startedAt: expectedAppliedAt,
    }
    setPendingOverrides((state) => ({
      ...state,
      [resolvedTargetUserId]: pendingEntry,
    }))

    try {
      await postJson('/api/audio/overrides/dm/apply', {
        sessionId,
        targetUserId: resolvedTargetUserId,
        overrideType,
        parameters,
      })

      telemetryClient.track('AUDIO_DM_OVERRIDE_APPLIED', {
        sessionId,
        targetUserId: resolvedTargetUserId,
        overrideType,
        role,
      })

      setDMOverride(resolvedTargetUserId, {
        userId: resolvedTargetUserId,
        overrideType,
        parameters,
        appliedAt: expectedAppliedAt,
      })
      setSuccess(`${overrideType} override sent. Waiting for realtime confirmation.`)
    } catch (err) {
      setPendingOverrides((state) => {
        const next = { ...state }
        delete next[resolvedTargetUserId]
        return next
      })
      setError(err instanceof Error ? err.message : 'Failed to apply override')
    } finally {
      setIsSubmitting(false)
    }
  }

  const removeOverride = async (
    overrideType: 'MUTE' | 'GAIN' | 'GATE' | 'FILTER' | 'DISTANCE' | 'CONDITION' | 'VOICE'
  ) => {
    if (!selectedTargetUserId) {
      setError('Select a participant first.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      await postJson('/api/audio/overrides/dm/remove', {
        sessionId,
        targetUserId: selectedTargetUserId,
        overrideType,
      })

      telemetryClient.track('AUDIO_DM_OVERRIDE_REMOVED', {
        sessionId,
        targetUserId: selectedTargetUserId,
        overrideType,
        role,
      })

      removeDMOverride(selectedTargetUserId, overrideType)
      setSuccess(`${overrideType} override removed.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove override')
    } finally {
      setIsSubmitting(false)
    }
  }

  const applyVoiceMode = async () => {
    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const body: Record<string, unknown> = {
        sessionId,
        voiceMode: localVoiceMode,
        backgroundVolume: localBackgroundVolume,
      }
      if (localVoiceMode === 'TARGET_GROUP' && localTargetGroupId) {
        body.targetGroupId = localTargetGroupId
      }

      const response = await fetch(`${apiUrl}/api/audio/voice-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string }
        throw new Error(payload.message || 'Failed to set voice mode')
      }

      telemetryClient.track('AUDIO_DM_VOICE_MODE_CHANGED', {
        sessionId,
        voiceMode: localVoiceMode,
        backgroundVolume: localBackgroundVolume,
        role,
      })

      setSuccess(
        `Voice mode set to ${localVoiceMode === 'BROADCAST' ? 'Broadcast' : 'Target Group'}.`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set voice mode')
    } finally {
      setIsSubmitting(false)
    }
  }

  const moveParticipantToRoom = async (userId: UUID, toRoomId: UUID) => {
    const participant = participantsById[userId]
    if (!participant) {
      return
    }

    const fromRoomId = pendingRoomMoves[userId]?.toRoomId || participant.primaryRoomId
    if (fromRoomId === toRoomId) {
      return
    }

    const pendingMove: PendingMove = {
      userId,
      username: participant.username,
      fromRoomId,
      toRoomId,
      startedAt: Date.now(),
    }

    setPendingRoomMoves((state) => ({
      ...state,
      [userId]: pendingMove,
    }))
    setError(null)
    setSuccess(`Moving ${participant.username} to selected room...`)

    try {
      const response = await fetch(`${apiUrl}/api/rooms/${toRoomId}/members/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          targetUserId: userId,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string }
        throw new Error(payload.message || 'Failed to request room move')
      }

      telemetryClient.track('ROOM_SWITCH', {
        sessionId,
        targetUserId: userId,
        fromRoomId,
        toRoomId,
        role,
      })
    } catch (err) {
      setPendingRoomMoves((state) => {
        const next = { ...state }
        delete next[userId]
        return next
      })
      setError(err instanceof Error ? err.message : 'Failed to request room move')
    }
  }

  useEffect(() => {
    const now = Date.now()

    setPendingOverrides((state) => {
      let changed = false
      const next: Record<UUID, PendingOverride> = { ...state }

      for (const [userId, pending] of Object.entries(state) as Array<[UUID, PendingOverride]>) {
        const live = getUserDMOverride(dmOverrides, userId, pending.overrideType)
        if (
          live &&
          live.overrideType === pending.overrideType &&
          typeof live.appliedAt === 'number' &&
          live.appliedAt > pending.expectedAppliedAt
        ) {
          delete next[userId]
          changed = true
          setSuccess(`${pending.overrideType} override confirmed from websocket state.`)
          continue
        }

        if (now - pending.startedAt > OVERRIDE_CONFIRMATION_TIMEOUT_MS) {
          delete next[userId]
          changed = true
          setError(`Timed out waiting for realtime confirmation for ${pending.overrideType}.`)
        }
      }

      return changed ? next : state
    })
  }, [dmOverrides])

  useEffect(() => {
    const now = Date.now()
    setPendingRoomMoves((state) => {
      let changed = false
      const next = { ...state }

      for (const [userId, pending] of Object.entries(state) as Array<[UUID, PendingMove]>) {
        const live = participantsById[userId]
        if (live?.primaryRoomId === pending.toRoomId) {
          delete next[userId]
          changed = true
          setSuccess(`${pending.username} moved to room and reconciled from websocket state.`)
          continue
        }

        if (now - pending.startedAt > ROOM_MOVE_CONFIRMATION_TIMEOUT_MS) {
          delete next[userId]
          changed = true
          setError(`Timed out waiting for realtime room move confirmation for ${pending.username}.`)
        }
      }

      return changed ? next : state
    })
  }, [participantsById])

  const participantRoomById = useMemo(() => {
    return buildParticipantRoomById(controllableParticipants, pendingRoomMoves)
  }, [controllableParticipants, pendingRoomMoves])

  const playersByRoom = useMemo(() => {
    return buildPlayersByRoom(rooms, controllableParticipants, participantRoomById)
  }, [controllableParticipants, participantRoomById, rooms])

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
        onApply={applyEnvironment}
        isSubmitting={isSubmitting}
      />

      <DMVoicePresetSection
        voicePresets={voicePresets}
        selectedVoicePresetName={selectedVoicePresetName}
        onVoiceChange={setSelectedVoicePresetName}
        onApply={() =>
          applyOverride(
            'FILTER',
            { presetCategory: 'VOICE', presetName: selectedVoicePresetName },
            dmUserId
          )
        }
        onClear={() => removeOverride('VOICE')}
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
        onMute={() => applyOverride('MUTE')}
        onUnmute={() => removeOverride('MUTE')}
        onApplyGain={() => applyOverride('GAIN', { gain: gainPercent / 100 })}
        onClearGain={() => removeOverride('GAIN')}
        onApplyDistance={() =>
          applyOverride('DISTANCE', {
            presetCategory: 'DISTANCE',
            presetName: selectedDistancePresetName,
          })
        }
        onClearDistance={() => removeOverride('DISTANCE')}
        onApplyCondition={() =>
          applyOverride('CONDITION', {
            presetCategory: 'CONDITION',
            presetName: selectedConditionPresetName,
            conditionName: selectedConditionPresetName,
          })
        }
        onClearCondition={() => removeOverride('CONDITION')}
        onApplyFilter={() =>
          applyOverride('FILTER', {
            presetCategory: 'FILTER',
            presetName: selectedFilterPreset?.name,
            ...(selectedFilterPreset?.params || {}),
          })
        }
        onClearFilter={() => removeOverride('FILTER')}
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
          if (resolvedUserId) {
            void moveParticipantToRoom(resolvedUserId, roomId)
          }
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
            <input
              id="dm-background-volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={localBackgroundVolume}
              onChange={(e) => setLocalBackgroundVolume(Number(e.target.value))}
              className="w-full"
            />
          </div>
        )}

        <button
          type="button"
          className="mt-1 w-fit rounded bg-accent px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
          disabled={isSubmitting}
          onClick={() => void applyVoiceMode()}
        >
          Apply Voice Mode
        </button>
      </div>

      {error ? (
        <p className="m-0 text-sm text-ui-error-text" role="alert">
          {error}
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
