import type { SpectatorPromotionResult } from '@/types/guest-auth.types'

export type RemoveUserFromSessionResult = {
  removed: boolean
  promotedSpectator: SpectatorPromotionResult
}
