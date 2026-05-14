import type { UUID } from '@shared'
import type { AudioDMOverridesByUser } from '@/utils/audioOverrides'
import { getUserDMOverride } from '@/utils/audioOverrides'
import { FILTER_PRESETS } from '../../constants/dmAudioControls.constants'
import type { AudioRoomOption, ParticipantOption, PendingMove } from './dmAudioControls.types'

export function buildParticipantsById(
  participants: ParticipantOption[]
): Record<UUID, ParticipantOption> {
  return Object.fromEntries(
    participants.map((participant) => [participant.userId, participant])
  ) as Record<UUID, ParticipantOption>
}

export function buildParticipantRoomById(
  controllableParticipants: ParticipantOption[],
  pendingRoomMoves: Record<UUID, PendingMove>
): Record<UUID, UUID | undefined> {
  const next: Record<UUID, UUID | undefined> = {}

  for (const participant of controllableParticipants) {
    const pendingMove = pendingRoomMoves[participant.userId]
    next[participant.userId] = pendingMove?.toRoomId || participant.primaryRoomId
  }

  return next
}

export function buildPlayersByRoom(
  rooms: AudioRoomOption[],
  controllableParticipants: ParticipantOption[],
  participantRoomById: Record<UUID, UUID | undefined>
): Record<UUID, ParticipantOption[]> {
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
}

export function getActiveOverrideSummary(
  dmOverrides: AudioDMOverridesByUser,
  selectedTargetUserId: UUID | ''
): string | undefined {
  if (!selectedTargetUserId) {
    return undefined
  }

  return [
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
}

export function getSelectedFilterPreset(selectedFilterPresetId: string) {
  return FILTER_PRESETS.find((preset) => preset.id === selectedFilterPresetId) || FILTER_PRESETS[0]
}
