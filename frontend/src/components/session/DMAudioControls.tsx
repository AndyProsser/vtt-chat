/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PresenceState, Role, RoomType, UUID } from '@shared'
import { DMEnvironmentSection } from '../audio/DMEnvironmentSection'
import { DMPlayerOverridesSection } from '../audio/DMPlayerOverridesSection'
import { DMRoomMovementSection } from '../audio/DMRoomMovementSection'
import { DMVoicePresetSection } from '../audio/DMVoicePresetSection'
import { useStore } from '../../hooks/useStore'
import { getUserDMOverride } from '@/utils/audioOverrides'
import { telemetryClient } from '../../utils/telemetry'

interface AudioRoomOption {
  id: UUID
  name: string
  type: RoomType
}

interface ParticipantOption {
  userId: UUID
  username: string
  state: PresenceState
  primaryRoomId?: UUID
}

interface AudioPreset {
  id: string
  name: string
  category: 'VOICE' | 'DISTANCE' | 'ENVIRONMENT' | 'CONDITION' | 'IC'
}

interface DMAudioControlsProps {
  apiUrl: string
  token: string
  role: Role
  sessionId: UUID
  dmUserId: UUID
  rooms: AudioRoomOption[]
  participants: ParticipantOption[]
}

interface PendingOverride {
  userId: UUID
  overrideType: 'MUTE' | 'UNMUTE' | 'GAIN' | 'GATE' | 'FILTER'
  expectedAppliedAt: number
  startedAt: number
}

interface PendingMove {
  userId: UUID
  username: string
  fromRoomId?: UUID
  toRoomId: UUID
  startedAt: number
}

const FILTER_PRESETS: Array<{ id: string; name: string; params: Record<string, unknown> }> = [
  {
    id: 'filter-radio',
    name: 'Radio',
    params: { lowpassHz: 2400, highpassHz: 300, drive: 0.05 },
  },
  {
    id: 'filter-whisper',
    name: 'Whisper',
    params: { lowpassHz: 5200, gain: 0.75, breathMix: 0.2 },
  },
  {
    id: 'filter-helmet',
    name: 'Helmet',
    params: { lowpassHz: 1800, resonance: 0.7, gain: 0.85 },
  },
]

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

  const participantsById = useMemo(
    () =>
      Object.fromEntries(
        participants.map((participant) => [participant.userId, participant])
      ) as Record<UUID, ParticipantOption>,
    [participants]
  )

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

        if (now - pending.startedAt > 10000) {
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

        if (now - pending.startedAt > 10000) {
          delete next[userId]
          changed = true
          setError(`Timed out waiting for realtime room move confirmation for ${pending.username}.`)
        }
      }

      return changed ? next : state
    })
  }, [participantsById])

  const participantRoomById = useMemo(() => {
    const next: Record<UUID, UUID | undefined> = {}

    for (const participant of controllableParticipants) {
      const pendingMove = pendingRoomMoves[participant.userId]
      next[participant.userId] = pendingMove?.toRoomId || participant.primaryRoomId
    }

    return next
  }, [controllableParticipants, pendingRoomMoves])

  const playersByRoom = useMemo(() => {
    const grouped: Record<UUID, ParticipantOption[]> = {}
    for (const room of rooms) {
      grouped[room.id] = []
    }

    for (const participant of controllableParticipants) {
      const roomId = participantRoomById[participant.userId]
      if (roomId && grouped[roomId]) {
        grouped[roomId].push(participant)
      }
    }

    return grouped
  }, [controllableParticipants, participantRoomById, rooms])

  if (role !== 'DM') {
    return <p className="m-0 text-sm text-ui-secondary">Audio controls are DM-only.</p>
  }

  const activeOverride = selectedTargetUserId
    ? [
        getUserDMOverride(dmOverrides, selectedTargetUserId, 'MUTE'),
        getUserDMOverride(dmOverrides, selectedTargetUserId, 'GAIN'),
        getUserDMOverride(dmOverrides, selectedTargetUserId, 'DISTANCE'),
        getUserDMOverride(dmOverrides, selectedTargetUserId, 'CONDITION'),
        getUserDMOverride(dmOverrides, selectedTargetUserId, 'FILTER'),
        getUserDMOverride(dmOverrides, selectedTargetUserId, 'VOICE'),
      ]
        .filter(Boolean)
        .map((override) => override?.overrideType)
        .join(', ')
    : undefined
  const selectedFilterPreset =
    FILTER_PRESETS.find((preset) => preset.id === selectedFilterPresetId) || FILTER_PRESETS[0]

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
