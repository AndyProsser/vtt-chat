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
  | 'CAMPAIGN:LIST_INVALIDATED'

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

export type CampaignEvent =
  | CampaignJoinRequestReceivedEvent
  | CampaignJoinRequestResolvedEvent
  | CampaignRetiredEvent
  | CampaignResumedEvent
  | CampaignListInvalidatedEvent
