export * from '@/types/guest-auth.types'
export {
  getExtensionPreflight,
  getPlatformStatus,
  validatePlayerInviteCode,
  validateSpectatorInviteCode,
} from '@/services/guest-auth/discovery.service'
export {
  browseSpectatorCampaignsForUser,
  getSpectatorWaitlistStatus,
  joinGuestSpectatorViaInvite,
  promoteNextWaitlistedSpectatorForSession,
} from '@/services/guest-auth/spectator.service'
export { loginGuestViaExtension } from '@/services/guest-auth/extension.service'
export {
  joinGuestPlayerViaInvite,
  precheckPlayerInviteEmail,
} from '@/services/guest-auth/player.service'
export { upgradeGuestAccount } from '@/services/guest-auth/account-upgrade.service'
