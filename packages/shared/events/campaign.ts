/**
 * Campaign Events
 * Out-of-session lobby events for campaign discovery, join requests, and lifecycle changes.
 *
 * These events are NOT session-scoped — they are campaign-scoped and broadcast to
 * the DM's authenticated WS connection regardless of active session state.
 */

import type { UUID } from '../types'
import type { EventEnvelope } from './base'

export type CampaignEventType =
  | 'CAMPAIGN:JOIN_REQUEST_RECEIVED'
  | 'CAMPAIGN:JOIN_REQUEST_RESOLVED'
  | 'CAMPAIGN:RETIRED'
  | 'CAMPAIGN:RESUMED'
  | 'CAMPAIGN:LOBBY_STATS_UPDATED'
  | 'CAMPAIGN:LIST_INVALIDATED'
  | 'CAMPAIGN:PARTY_PRESENCE_UPDATED'

// ---------------------------------------------------------------------------
// CAMPAIGN:JOIN_REQUEST_RECEIVED
// Emitted to the DM when a full user submits a join request for a PUBLIC campaign.
// Payload drives the pending-badge count and inline approval panel on the lobby card.
// ---------------------------------------------------------------------------
export interface CampaignJoinRequestReceivedPayload {
  campaignId: UUID
  requestId: UUID
  userId: UUID
  displayName: string
  avatarUrl: string | null
  requestedAt: number // Unix ms
  message?: string
  pendingCount: number // Total pending requests for this campaign after this one
}

export type CampaignJoinRequestReceivedEvent = EventEnvelope<CampaignJoinRequestReceivedPayload>

// ---------------------------------------------------------------------------
// CAMPAIGN:JOIN_REQUEST_RESOLVED
// Emitted to the requesting user when the DM approves or rejects their request.
// ---------------------------------------------------------------------------
export interface CampaignJoinRequestResolvedPayload {
  campaignId: UUID
  requestId: UUID
  resolution: 'APPROVED' | 'REJECTED'
  campaignName: string
}

export type CampaignJoinRequestResolvedEvent = EventEnvelope<CampaignJoinRequestResolvedPayload>

// ---------------------------------------------------------------------------
// CAMPAIGN:RETIRED
// Emitted to the DM's own connection when a campaign is retired (lobby list update).
// ---------------------------------------------------------------------------
export interface CampaignRetiredPayload {
  campaignId: UUID
  retiredAt: number // Unix ms
}

export type CampaignRetiredEvent = EventEnvelope<CampaignRetiredPayload>

// ---------------------------------------------------------------------------
// CAMPAIGN:RESUMED
// Emitted to the DM's own connection when a retired campaign is resumed.
// ---------------------------------------------------------------------------
export interface CampaignResumedPayload {
  campaignId: UUID
}

export type CampaignResumedEvent = EventEnvelope<CampaignResumedPayload>

// ---------------------------------------------------------------------------
// CAMPAIGN:LIST_INVALIDATED
// Lightweight lobby refresh signal. Frontend should refetch /api/campaigns
// (and any discover list) rather than trusting stale card state.
// ---------------------------------------------------------------------------
export interface CampaignListInvalidatedPayload {
  campaignId: UUID | null
  reason: 'CREATED' | 'RUNTIME_PRESENCE_CHANGED'
}

export type CampaignListInvalidatedEvent = EventEnvelope<CampaignListInvalidatedPayload>

// ---------------------------------------------------------------------------
// CAMPAIGN:LOBBY_STATS_UPDATED
// Sessionless lobby snapshot. Frontend consumes this directly for the top
// stats instead of deriving them from stale local card state.
// ---------------------------------------------------------------------------
export interface CampaignLobbyStatsUpdatedPayload {
  activeSessions: number
  connectedPlayersAndDms: number
  connectedSpectators: number
  peakConcurrentUsers24h: number
  activeCampaigns: number
  pausedCampaigns: number
  totalEndedSessionDurationMs: number
  averageEndedSessionDurationMs: number
}

export type CampaignLobbyStatsUpdatedEvent = EventEnvelope<CampaignLobbyStatsUpdatedPayload>

// ---------------------------------------------------------------------------
// CAMPAIGN:PARTY_PRESENCE_UPDATED
// Campaign-scoped signal used by PARTY panel to refresh campaign roster presence
// immediately without waiting for periodic polling.
// ---------------------------------------------------------------------------
export interface CampaignPartyPresenceUpdatedPayload {
  campaignId: UUID
  sessionId: UUID | null
  reason:
    | 'PRESENCE_STATE_CHANGED'
    | 'SESSION_STATE_CHANGED'
    | 'SESSION_COOLDOWN_ENDED'
    | 'EXPLICIT_EXIT'
    | 'RUNTIME_PRESENCE_CHANGED'
  changedAt: number
}

export type CampaignPartyPresenceUpdatedEvent = EventEnvelope<CampaignPartyPresenceUpdatedPayload>

export type CampaignEvent =
  | CampaignJoinRequestReceivedEvent
  | CampaignJoinRequestResolvedEvent
  | CampaignRetiredEvent
  | CampaignResumedEvent
  | CampaignLobbyStatsUpdatedEvent
  | CampaignListInvalidatedEvent
  | CampaignPartyPresenceUpdatedEvent
