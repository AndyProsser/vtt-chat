import { useRef } from 'react'
import type { Role, UUID } from '@shared'
import { useStore } from '@/hooks/useStore'
import type { WhisperRecipientOption } from '@/types/chat'
import { EMPTY_SESSION_PRESENCE, EMPTY_WHISPER_RECIPIENTS } from '@/constants/chatComposer.constants'

interface UseWhisperRecipientsParams {
  sessionId: UUID | undefined
  currentUserId: UUID | undefined
  currentRoomId: UUID | undefined
  isDmRole: boolean
  sessionDmId: UUID | undefined
  whisperRecipients: WhisperRecipientOption[]
}

/**
 * Derives the effective whisper recipient list from session presence state.
 * Stable-references the result when contents are unchanged to prevent re-renders.
 */
export function useWhisperRecipients({
  sessionId,
  currentUserId,
  currentRoomId,
  isDmRole,
  sessionDmId,
  whisperRecipients,
}: UseWhisperRecipientsParams): WhisperRecipientOption[] {
  const cacheRef = useRef<WhisperRecipientOption[]>(EMPTY_WHISPER_RECIPIENTS)

  return useStore((state) => {
    if (!sessionId || !currentUserId) {
      cacheRef.current = whisperRecipients
      return whisperRecipients
    }

    const sessionPresence =
      ((state.sessionPresence as any)[sessionId] as typeof EMPTY_SESSION_PRESENCE) ??
      EMPTY_SESSION_PRESENCE
    const participants = Object.entries(sessionPresence) as Array<
      [
        UUID,
        {
          username: string
          characterName?: string | null
          avatarUrl?: string | null
          role?: Role | string
          primaryRoomId?: UUID
        },
      ]
    >

    if (participants.length === 0) {
      if (cacheRef.current !== EMPTY_WHISPER_RECIPIENTS) {
        cacheRef.current = EMPTY_WHISPER_RECIPIENTS
      }
      return EMPTY_WHISPER_RECIPIENTS
    }

    const nextRecipients = participants
      .filter(([participantUserId, participant]) => {
        if (participantUserId === currentUserId) return false
        if (isDmRole) return true
        if (participantUserId === sessionDmId) return false
        return participant.primaryRoomId === currentRoomId
      })
      .map(([participantUserId, participant]) => ({
        id: participantUserId,
        label:
          participant.characterName && participant.characterName.trim().length > 0
            ? participant.characterName
            : participant.username,
        avatarUrl: participant.avatarUrl,
      }))
      .sort((left, right) => left.label.localeCompare(right.label))

    const prev = cacheRef.current
    const isUnchanged =
      prev.length === nextRecipients.length &&
      prev.every((recipient, index) => {
        const next = nextRecipients[index]
        return (
          recipient.id === next.id &&
          recipient.label === next.label &&
          recipient.avatarUrl === next.avatarUrl
        )
      })

    if (isUnchanged) return prev

    cacheRef.current = nextRecipients
    return nextRecipients
  })
}
