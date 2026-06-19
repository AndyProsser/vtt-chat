import type {
  ExtensionSyncPolicy,
  LateJoinPolicy,
  MessageType,
  NoteVisibility,
  Prisma,
  Role,
  RoomType,
  SessionLogEventType,
  SessionScheduleType,
  SessionState,
  SpectatorPolicy,
  SupportedPlatform,
} from '@prisma/client'

export interface CampaignTransferBundle {
  version: number
  exportedAt: string
  sourceCampaignId: string
  campaign: {
    name: string
    description: string | null
    posterUrl: string | null
    inviteCode: string
    currentDmId: string
    currentDmUsername: string
    createdAt: string
    updatedAt: string
    settings: {
      discoverable: boolean
      spectatorPolicy: SpectatorPolicy
      spectatorMax: number | null
      spectatorWaitlistEnabled: boolean
      spectatorReconnectGraceSecs: number
      extensionSyncPolicy: ExtensionSyncPolicy
      lateJoinPolicy: LateJoinPolicy
      lateJoinGraceMinutes: number
      postSessionChatEnabled: boolean
      postSessionChatDurationMs: number
      dmAutoTargetOnFirstPlayerJoin: boolean
      defaultSessionDurationMins: number
      supportedPlatforms: SupportedPlatform[]
    }
    schedule: {
      sessionScheduleType: SessionScheduleType | null
      sessionScheduleDay: number | null
      sessionScheduleNth: number | null
      sessionScheduleHour: number | null
      sessionScheduleMinute: number | null
      sessionScheduleTz: string | null
      nextSessionDate: string | null
      nextSessionIsManual: boolean
    } | null
  }
  members: Array<{
    userId: string
    username: string
    displayName: string
    email: string | null
    campaignRole: Role
    userRole: Role
  }>
  characters: Array<{
    userId: string
    name: string
    status: string
    race: string | null
    class: string | null
    subclass: string | null
    avatarUrl: string | null
    isActive: boolean
    metadata: Prisma.JsonValue | null
    createdAt: string
    updatedAt: string
  }>
  campaignNotes: Array<{
    authorId: string
    authorUsername: string
    title: string
    content: string
    visibility: NoteVisibility
    tags: Prisma.JsonValue | null
    allowedUsers: Prisma.JsonValue | null
    attachments: Prisma.JsonValue | null
    publishedAt: string | null
    createdAt: string
    updatedAt: string
  }>
  greenroomMessages: Array<{
    authorId: string
    authorUsername: string
    content: string
    type: MessageType
    isDmOnly: boolean
    visibleTo: Prisma.JsonValue | null
    createdAt: string
    editedAt: string | null
    deletedAt: string | null
    deletedBy: string | null
  }>
  sessions: Array<{
    id: string
    name: string
    description: string | null
    state: SessionState
    createdAt: string
    startedAt: string | null
    endedAt: string | null
    updatedAt: string
    rooms: Array<{
      id: string
      name: string
      type: RoomType
      createdBy: string
      createdAt: string
      updatedAt: string
    }>
    members: Array<{
      userId: string
      username: string
      role: Role
      joinedAt: string
    }>
    messages: Array<{
      authorId: string
      authorUsername: string
      content: string
      type: MessageType
      isDmOnly: boolean
      visibleTo: Prisma.JsonValue | null
      metadata: Prisma.JsonValue | null
      createdAt: string
      editedAt: string | null
      deletedAt: string | null
      deletedBy: string | null
    }>
    notes: Array<{
      authorId: string
      authorUsername: string
      title: string
      content: string
      visibility: NoteVisibility
      tags: Prisma.JsonValue | null
      allowedUsers: Prisma.JsonValue | null
      attachments: Prisma.JsonValue | null
      publishedAt: string | null
      createdAt: string
      updatedAt: string
    }>
    logs: Array<{
      userId: string | null
      username: string
      eventType: SessionLogEventType
      detail: string | null
      createdAt: string
    }>
  }>
  recordings: Array<{
    title: string
    sessionId: string | null
    roomId: string | null
    storageKey: string | null
    sourceUrl: string | null
    durationSeconds: number | null
    startedAt: string | null
    endedAt: string | null
    journalSummary: string | null
    metadata: Prisma.JsonValue | null
    createdAt: string
    updatedAt: string
  }>
}

export interface OperationalExportBundle {
  version: number
  exportedAt: string
  settings: Record<string, unknown>
  telemetry: Array<Record<string, unknown>>
  diagnostics: Array<Record<string, unknown>>
  auditLog: Array<Record<string, unknown>>
}
