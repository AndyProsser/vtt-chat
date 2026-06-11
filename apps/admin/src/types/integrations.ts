/** Authorization state for an external integration system. */
export type AuthorizationState = 'AUTHORIZED' | 'LOG_ONLY' | 'BLOCKED'

/** Permitted capability scopes for an external integration. */
export type IntegrationScope = 'auth' | 'log_ingestion' | 'metadata_sync'

/** Live metrics for an integration system. */
export interface IntegrationMetrics {
  linkedUsers: number
  requests24h: number
  lastSeenAt: string | null
}

/** Full integration system record returned by the admin API. */
export interface IntegrationSystem {
  system: string
  displayName: string
  authCapable: boolean
  logIngestionCapable: boolean
  metadataSyncCapable: boolean
  authorizationState: AuthorizationState
  allowedScopes: IntegrationScope[]
  notes: string
  lastUpdatedAt: string
  metrics: IntegrationMetrics
}
