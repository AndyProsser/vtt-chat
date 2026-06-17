export type LateJoinPolicy = 'OPEN' | 'SCREENED' | 'BLOCKED'
export type CampaignVisibility = 'PUBLIC' | 'PRIVATE'
export type ExtensionSyncPolicy = 'ALLOW' | 'DM_ONLY' | 'NONE'
export type PersistedExtensionSyncPolicy = 'DM_AND_PLAYERS' | 'DM_ONLY' | 'NONE'
export type SupportedPlatform = 'ANY' | 'DDB' | 'ROLL20' | 'FOUNDRY'
/** Who may push party-targeted inventory/currency sync payloads. */
export type ExtensionPartyInventorySyncAccess = 'DISABLED' | 'DM_ONLY' | 'ALL_PLAYERS'
/** How the server handles incoming data that conflicts with existing records. */
export type ExtensionSyncConflictResolution = 'OVERWRITE' | 'IGNORE' | 'PROMPT'
