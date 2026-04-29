/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity */
import { useEffect, useMemo, useState } from 'react'
import type { PresenceState, Role, RoomType, UUID } from '@shared'
import { useStore } from '../../hooks/useStore'
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
        const response = await fetch(`${apiUrl}/api/audio/presets`, {
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
      await postJson('/api/audio/environment', {
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
    overrideType: 'MUTE' | 'UNMUTE' | 'GAIN' | 'GATE' | 'FILTER',
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
      await postJson('/api/audio/dm-override/apply', {
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

  const removeOverride = async (overrideType: string) => {
    if (!selectedTargetUserId) {
      setError('Select a participant first.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      await postJson('/api/audio/dm-override/remove', {
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

      setDMOverride(selectedTargetUserId, null)
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
      const response = await fetch(`${apiUrl}/api/rooms/${toRoomId}/move-user`, {
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
        const live = dmOverrides.get(userId)
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
    return (
      <p className="m-0 text-sm text-ui-secondary">Audio controls are DM-only during Stage 9.2.</p>
    )
  }

  const activeOverride = selectedTargetUserId ? dmOverrides.get(selectedTargetUserId) : undefined
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

      <section className="rounded-ui-md border border-ui-border p-2.5">
        <p className="mb-2 mt-0 font-semibold text-ui-primary">Room Environment</p>
        <div className="grid gap-2">
          <label className="grid gap-1">
            <span className="text-xs text-ui-secondary">Room</span>
            <select
              aria-label="Audio Room"
              value={selectedRoomId}
              onChange={(event) => setSelectedRoomId(event.target.value as UUID)}
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
              onChange={(event) => setSelectedEnvironmentName(event.target.value)}
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
            onClick={applyEnvironment}
            className="w-fit rounded-ui-sm bg-ui-brand px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Apply Environment
          </button>
        </div>
      </section>

      <section className="rounded-ui-md border border-ui-border p-2.5">
        <p className="mb-2 mt-0 font-semibold text-ui-primary">DM Voice Preset</p>
        <div className="grid gap-2">
          <label className="grid gap-1">
            <span className="text-xs text-ui-secondary">Voice</span>
            <select
              aria-label="DM Voice Preset"
              value={selectedVoicePresetName}
              onChange={(event) => setSelectedVoicePresetName(event.target.value)}
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
              onClick={() =>
                applyOverride(
                  'FILTER',
                  {
                    presetCategory: 'VOICE',
                    presetName: selectedVoicePresetName,
                  },
                  dmUserId
                )
              }
              className="rounded-ui-sm bg-ui-brand px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Apply DM Voice
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => removeOverride('VOICE')}
              className="rounded-ui-sm border border-ui-border px-3 py-1.5 text-sm text-ui-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear DM Voice
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-ui-md border border-ui-border p-2.5">
        <p className="mb-2 mt-0 font-semibold text-ui-primary">Player Overrides</p>
        <div className="grid gap-2">
          <label className="grid gap-1">
            <span className="text-xs text-ui-secondary">Target Player</span>
            <select
              aria-label="Override Target"
              value={selectedTargetUserId}
              onChange={(event) => setSelectedTargetUserId(event.target.value as UUID)}
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
              onClick={() => applyOverride('MUTE')}
              className="rounded-ui-sm bg-ui-brand px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Mute
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => removeOverride('MUTE')}
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
              onChange={(event) => setGainPercent(Number(event.target.value))}
              className="accent-sky-600"
            />
          </label>

          <div className="inline-flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => applyOverride('GAIN', { gain: gainPercent / 100 })}
              className="rounded-ui-sm bg-ui-brand px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Apply Gain
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => removeOverride('GAIN')}
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
              onChange={(event) => setSelectedDistancePresetName(event.target.value)}
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
              onClick={() =>
                applyOverride('FILTER', {
                  presetCategory: 'DISTANCE',
                  presetName: selectedDistancePresetName,
                })
              }
              className="rounded-ui-sm bg-ui-brand px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Apply Distance
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => removeOverride('DISTANCE')}
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
              onChange={(event) => setSelectedConditionPresetName(event.target.value)}
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
              onClick={() =>
                applyOverride('FILTER', {
                  presetCategory: 'CONDITION',
                  presetName: selectedConditionPresetName,
                })
              }
              className="rounded-ui-sm bg-ui-brand px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Apply Condition
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => removeOverride('CONDITION')}
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
              onChange={(event) => setSelectedFilterPresetId(event.target.value)}
              className="rounded-ui-sm border border-ui-border-soft bg-ui-surface px-2 py-2 text-sm text-ui-primary"
            >
              {FILTER_PRESETS.map((preset) => (
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
              onClick={() =>
                applyOverride('FILTER', {
                  presetCategory: 'FILTER',
                  presetName: selectedFilterPreset?.name,
                  ...(selectedFilterPreset?.params || {}),
                })
              }
              className="rounded-ui-sm bg-ui-brand px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Apply Filter
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => removeOverride('FILTER')}
              className="rounded-ui-sm border border-ui-border px-3 py-1.5 text-sm text-ui-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear Filter
            </button>
          </div>

          <p className="m-0 text-xs text-ui-secondary">
            Active override:{' '}
            <strong>{activeOverride ? activeOverride.overrideType : 'None'}</strong>
          </p>
          {selectedTargetUserId && pendingOverrides[selectedTargetUserId] ? (
            <p className="m-0 text-xs text-amber-700">
              Pending sync: waiting for websocket reconciliation.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-ui-md border border-ui-border p-2.5">
        <p className="mb-2 mt-0 font-semibold text-ui-primary">Room Movement (Drag and Drop)</p>
        <p className="mb-2 text-xs text-ui-secondary">
          Drag players between room columns. The UI applies optimistic state and waits for realtime
          confirmation before finalizing.
        </p>

        <div className="grid gap-2">
          {rooms.map((room) => (
            <section
              key={room.id}
              aria-label={`Drop Room ${room.name}`}
              onDragOver={(event) => {
                event.preventDefault()
              }}
              onDrop={(event) => {
                event.preventDefault()
                const droppedUserId = (event.dataTransfer.getData('text/plain') ||
                  draggedUserId ||
                  '') as UUID | ''
                if (droppedUserId) {
                  void moveParticipantToRoom(droppedUserId, room.id)
                }
                setDraggedUserId(null)
              }}
              className="rounded-ui-sm border border-dashed border-slate-400 bg-ui-surface-subtle p-2"
            >
              <p className="mb-1.5 mt-0 font-semibold text-ui-primary">
                {room.name} ({room.type})
              </p>

              <div className="grid gap-1">
                {(playersByRoom[room.id] || []).map((participant) => {
                  const pendingMove = pendingRoomMoves[participant.userId]
                  return (
                    <button
                      key={participant.userId}
                      type="button"
                      draggable
                      aria-label={`Drag ${participant.username}`}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', participant.userId)
                        setDraggedUserId(participant.userId)
                      }}
                      onDragEnd={() => setDraggedUserId(null)}
                      className="cursor-grab rounded-ui-sm border border-ui-border-soft bg-ui-surface px-2 py-1.5 text-left text-sm text-ui-primary"
                    >
                      {participant.username} ({participant.state})
                      {pendingMove ? ' - moving...' : ''}
                    </button>
                  )
                })}

                {(playersByRoom[room.id] || []).length === 0 ? (
                  <p className="m-0 text-xs text-ui-muted">No players</p>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </section>

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
