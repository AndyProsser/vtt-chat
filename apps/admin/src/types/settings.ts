export interface RuntimeSettings {
  // System — General
  primaryRegion: string
  siteName?: string
  adminSessionTimeoutHours?: number
  maxCampaignsPerUser?: number

  // System — Maintenance
  maintenanceMode: 'off' | 'read-only' | 'full'
  maintenanceMessage?: string

  // Feature Flags
  chatPipelineEnabled: boolean
  audioOverridesEnabled: boolean
  aiWritingAssistantEnabled?: boolean
  recordingEnabled?: boolean
  dmQuickGenerateEnabled?: boolean
  guestAccountsEnabled?: boolean

  // Storage / Retention
  logRetentionDays: number
  telemetryRetentionDays: number
  telemetryMaxFileSizeMb: number
  telemetryMaxFiles: number
  diagnosticRetentionDays: number
  diagnosticMaxFileSizeMb: number
  diagnosticMaxFiles: number
  recordingRetentionDays?: number

  // Email — SMTP
  smtpHost?: string
  smtpPort?: number
  smtpUser?: string
  /** Never returned in plaintext; true when a password is stored. */
  smtpPasswordSet?: boolean
  smtpEncryption?: 'none' | 'starttls' | 'tls'
  smtpFromAddress?: string
  smtpFromName?: string
  smtpReplyTo?: string

  // AI Integration
  aiProviderMode?: 'disabled' | 'local' | 'remote' | 'cloud'
  aiBaseUrl?: string
  /** Never returned in plaintext; true when a key is stored. */
  aiApiKeySet?: boolean
  aiCloudProvider?: 'openai' | 'anthropic'
  aiSummaryModel?: string
  aiAssistantModel?: string
  aiMonthlySpendLimit?: number

  // Backup
  /** Legacy field kept for compatibility; use backupSchedule (cron) instead. */
  backupWindow: string
  backupTarget?: 'local' | 's3'
  backupLocalPath?: string
  backupS3Bucket?: string
  backupS3Endpoint?: string
  backupS3AccessKey?: string
  /** Never returned in plaintext; true when a secret is stored. */
  backupS3SecretKeySet?: boolean
  backupS3Prefix?: string
  backupRetentionCount?: number
  backupSchedule?: string

  updatedAt: string
}
