import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Role, UUID } from '@shared'
import {
  OVERRIDE_CONFIRMATION_TIMEOUT_MS,
  ROOM_MOVE_CONFIRMATION_TIMEOUT_MS,
} from '@/constants/dmAudioControls.constants'
import { useStore } from '@/hooks/useStore'
import { getUserDMOverride } from '@/utils/audioOverrides'
import { telemetryClient } from '@/utils/telemetry'
import { buildParticipantRoomById, buildPlayersByRoom } from '@/utils/dmAudioControls'
import type {
  AudioRoomOption,
  ParticipantOption,
  PendingMove,
  PendingOverride,
} from '@/types/dmAudioControls'

interface UseDMAudioActionsParams {
  apiUrl: string
  token: string
  role: Role
  sessionId: UUID
  dmUserId: UUID
  rooms: AudioRoomOption[]
  participantsById: Record<UUID, ParticipantOption>
  controllableParticipants: ParticipantOption[]
}

type OverrideType =
  | 'MUTE'
  | 'UNMUTE'
  | 'GAIN'
  | 'GATE'
  | 'FILTER'
  | 'DISTANCE'
  | 'CONDITION'
  | 'VOICE'
type RemovableOverrideType = Exclude<OverrideType, 'UNMUTE'>

/**
 * Manages all async API calls and their pending/status state for DMAudioControls.
 * Returns action callbacks and pending state — owns no selection/form state.
 */
export function useDMAudioActions({
  apiUrl,
  token,
  role,
  sessionId,
  dmUserId,
  rooms,
  participantsById,
  controllableParticipants,
}: UseDMAudioActionsParams) {
  const dmOverrides = useStore((state) => state.dmOverrides)
  const setDMOverride = useStore((state) => state.setDMOverride)
  const removeDMOverride = useStore((state) => state.removeDMOverride)

  const [pendingOverrides, setPendingOverrides] = useState<Record<UUID, PendingOverride>>({})
  const [pendingRoomMoves, setPendingRoomMoves] = useState<Record<UUID, PendingMove>>({})
  const [draggedUserId, setDraggedUserId] = useState<UUID | null>(null)
  const draggedUserIdRef = useRef<UUID | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const postJson = useCallback(
    async (path: string, body: Record<string, unknown>) => {
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
    },
    [apiUrl, token]
  )

  const applyEnvironment = useCallback(
    async (roomId: UUID, environmentName: string) => {
      if (!roomId || !environmentName) {
        setError('Select a room and environment preset first.')
        return
      }
      setIsSubmitting(true)
      setError(null)
      setSuccess(null)
      try {
        await postJson('/api/audio/environments/apply', { sessionId, roomId, environmentName })
        telemetryClient.track('AUDIO_ENVIRONMENT_SET', { sessionId, roomId, environmentName, role })
        setSuccess(`Applied ${environmentName} to selected room.`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to apply environment')
      } finally {
        setIsSubmitting(false)
      }
    },
    [postJson, role, sessionId]
  )

  const applyOverride = useCallback(
    async (
      overrideType: OverrideType,
      parameters?: Record<string, unknown>,
      targetUserId?: UUID
    ) => {
      if (!targetUserId) {
        setError('Select a participant first.')
        return
      }
      setIsSubmitting(true)
      setError(null)
      setSuccess(null)
      const expectedAppliedAt = Date.now()
      setPendingOverrides((state) => ({
        ...state,
        [targetUserId]: {
          userId: targetUserId,
          overrideType,
          expectedAppliedAt,
          startedAt: expectedAppliedAt,
        },
      }))
      try {
        await postJson('/api/audio/overrides/dm/apply', {
          sessionId,
          targetUserId,
          overrideType,
          parameters,
        })
        telemetryClient.track('AUDIO_DM_OVERRIDE_APPLIED', {
          sessionId,
          targetUserId,
          overrideType,
          role,
        })
        setDMOverride(targetUserId, {
          userId: targetUserId,
          overrideType,
          parameters,
          appliedAt: expectedAppliedAt,
        })
        setSuccess(`${overrideType} override sent. Waiting for realtime confirmation.`)
      } catch (err) {
        setPendingOverrides((state) => {
          const next = { ...state }
          delete next[targetUserId]
          return next
        })
        setError(err instanceof Error ? err.message : 'Failed to apply override')
      } finally {
        setIsSubmitting(false)
      }
    },
    [postJson, role, sessionId, setDMOverride]
  )

  const removeOverride = useCallback(
    async (overrideType: RemovableOverrideType, targetUserId: UUID) => {
      if (!targetUserId) {
        setError('Select a participant first.')
        return
      }
      setIsSubmitting(true)
      setError(null)
      setSuccess(null)
      try {
        await postJson('/api/audio/overrides/dm/remove', { sessionId, targetUserId, overrideType })
        telemetryClient.track('AUDIO_DM_OVERRIDE_REMOVED', {
          sessionId,
          targetUserId,
          overrideType,
          role,
        })
        removeDMOverride(targetUserId, overrideType)
        setSuccess(`${overrideType} override removed.`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove override')
      } finally {
        setIsSubmitting(false)
      }
    },
    [postJson, removeDMOverride, role, sessionId]
  )

  const applyVoiceMode = useCallback(
    async (
      voiceMode: 'TARGET_GROUP' | 'BROADCAST',
      backgroundVolume: number,
      targetGroupId?: UUID | ''
    ) => {
      setIsSubmitting(true)
      setError(null)
      setSuccess(null)
      try {
        const body: Record<string, unknown> = { sessionId, voiceMode, backgroundVolume }
        if (voiceMode === 'TARGET_GROUP' && targetGroupId) {
          body.targetGroupId = targetGroupId
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
          voiceMode,
          backgroundVolume,
          role,
        })
        setSuccess(`Voice mode set to ${voiceMode === 'BROADCAST' ? 'Broadcast' : 'Target Group'}.`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to set voice mode')
      } finally {
        setIsSubmitting(false)
      }
    },
    [apiUrl, role, sessionId, token]
  )

  const moveParticipantToRoom = useCallback(
    async (userId: UUID, toRoomId: UUID) => {
      const participant = participantsById[userId]
      if (!participant) return
      const fromRoomId = pendingRoomMoves[userId]?.toRoomId || participant.primaryRoomId
      if (fromRoomId === toRoomId) return
      setPendingRoomMoves((state) => ({
        ...state,
        [userId]: {
          userId,
          username: participant.username,
          fromRoomId,
          toRoomId,
          startedAt: Date.now(),
        },
      }))
      setError(null)
      setSuccess(`Moving ${participant.username} to selected room...`)
      try {
        const response = await fetch(`${apiUrl}/api/rooms/${toRoomId}/members/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionId, targetUserId: userId }),
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
    },
    [apiUrl, participantsById, pendingRoomMoves, role, sessionId, token]
  )

  // Reconcile pending overrides against live WS state
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

  // Reconcile pending room moves against live WS state
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

  const participantRoomById = useMemo(
    () => buildParticipantRoomById(controllableParticipants, pendingRoomMoves),
    [controllableParticipants, pendingRoomMoves]
  )

  const playersByRoom = useMemo(
    () => buildPlayersByRoom(rooms, controllableParticipants, participantRoomById),
    [controllableParticipants, participantRoomById, rooms]
  )

  return {
    pendingOverrides,
    pendingRoomMoves,
    draggedUserId,
    setDraggedUserId,
    draggedUserIdRef,
    isSubmitting,
    error,
    success,
    participantRoomById,
    playersByRoom,
    applyEnvironment,
    applyOverride,
    removeOverride,
    applyVoiceMode,
    moveParticipantToRoom,
  }
}
