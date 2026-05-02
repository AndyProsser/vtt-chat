export type ExternalSystemKey = 'dndbeyond' | 'roll20' | 'foundry' | 'fantasygrounds' | 'owlbear'

export type IntegrationAuthorizationState = 'AUTHORIZED' | 'LOG_ONLY' | 'BLOCKED'

export type IntegrationScope = 'auth' | 'log_ingestion' | 'metadata_sync'

export interface ExternalSystemRecord {
  system: ExternalSystemKey
  displayName: string
  authCapable: boolean
  logIngestionCapable: boolean
  metadataSyncCapable: boolean
  authorizationState: IntegrationAuthorizationState
  allowedScopes: IntegrationScope[]
  notes: string
  lastUpdatedAt: string
}
