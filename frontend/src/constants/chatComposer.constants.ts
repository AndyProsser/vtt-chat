import type { Role, UUID } from '@shared'
import { MessageType } from '@shared'
import type { WhisperRecipientOption } from '@/types/chat'

export const EMPTY_SESSION_PRESENCE: Record<
  UUID,
  {
    username: string
    avatarUrl?: string | null
    characterName?: string | null
    role?: Role | string
    primaryRoomId?: UUID
  }
> = {}

export const EMPTY_WHISPER_RECIPIENTS: WhisperRecipientOption[] = []

export const MESSAGE_TYPE_ORDER: MessageType[] = [
  MessageType.IC,
  MessageType.OOC,
  MessageType.WHISPER,
  MessageType.DM,
]

export const ROLE_ALLOWED_TYPES: Record<string, MessageType[]> = {
  DM: [MessageType.IC, MessageType.OOC, MessageType.WHISPER],
  PLAYER: [MessageType.IC, MessageType.OOC, MessageType.WHISPER, MessageType.DM],
  SPECTATOR: [MessageType.OOC],
}
