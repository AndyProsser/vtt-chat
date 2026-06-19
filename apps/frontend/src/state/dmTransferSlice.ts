/**
 * DM Transfer Slice (Zustand)
 * Tracks pending campaign ownership transfer offers for the current user.
 *
 * incomingTransfer: set when this user is the target of a DM handoff offer.
 * outgoingTransfer: set when this user (as DM) has initiated a handoff and is awaiting response.
 */

import type { StateCreator } from 'zustand'
import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'

export interface IncomingDmTransfer {
  campaignId: UUID
  campaignName: string
  fromUserId: UUID
  fromUsername: string
  initiatedAt: number
  expiresAt: number
}

export interface OutgoingDmTransfer {
  campaignId: UUID
  toUserId: UUID
  toUsername: string
  initiatedAt: number
  expiresAt: number
}

export interface DmTransferSlice {
  // State — keyed by campaignId so multi-campaign users are supported
  incomingDmTransfers: Record<UUID, IncomingDmTransfer>
  outgoingDmTransfers: Record<UUID, OutgoingDmTransfer>

  // Actions
  setIncomingDmTransfer: (transfer: IncomingDmTransfer) => void
  clearIncomingDmTransfer: (campaignId: UUID) => void
  setOutgoingDmTransfer: (transfer: OutgoingDmTransfer) => void
  clearOutgoingDmTransfer: (campaignId: UUID) => void

  // WS event handlers
  handleDmTransferInitiated: (event: EventEnvelope) => void
  handleDmTransferResponded: (event: EventEnvelope) => void
  handleDmTransferCancelled: (event: EventEnvelope) => void
  handleDmTransferred: (event: EventEnvelope) => void
}

export const createDmTransferSlice: StateCreator<DmTransferSlice> = (set) => ({
  incomingDmTransfers: {},
  outgoingDmTransfers: {},

  setIncomingDmTransfer: (transfer) =>
    set((state) => ({
      incomingDmTransfers: { ...state.incomingDmTransfers, [transfer.campaignId]: transfer },
    })),

  clearIncomingDmTransfer: (campaignId) =>
    set((state) => {
      const next = { ...state.incomingDmTransfers }
      delete next[campaignId]
      return { incomingDmTransfers: next }
    }),

  setOutgoingDmTransfer: (transfer) =>
    set((state) => ({
      outgoingDmTransfers: { ...state.outgoingDmTransfers, [transfer.campaignId]: transfer },
    })),

  clearOutgoingDmTransfer: (campaignId) =>
    set((state) => {
      const next = { ...state.outgoingDmTransfers }
      delete next[campaignId]
      return { outgoingDmTransfers: next }
    }),

  handleDmTransferInitiated: (event) => {
    const p = event.payload as IncomingDmTransfer & { toUserId: UUID }
    set((state) => ({
      incomingDmTransfers: {
        ...state.incomingDmTransfers,
        [p.campaignId]: {
          campaignId: p.campaignId,
          campaignName: p.campaignName,
          fromUserId: p.fromUserId,
          fromUsername: p.fromUsername,
          initiatedAt: p.initiatedAt,
          expiresAt: p.expiresAt,
        },
      },
    }))
  },

  handleDmTransferResponded: (event) => {
    const p = event.payload as { campaignId: UUID; response: 'ACCEPTED' | 'DECLINED' }
    set((state) => {
      const next = { ...state.outgoingDmTransfers }
      delete next[p.campaignId]
      return { outgoingDmTransfers: next }
    })
  },

  handleDmTransferCancelled: (event) => {
    const p = event.payload as { campaignId: UUID }
    set((state) => {
      const next = { ...state.incomingDmTransfers }
      delete next[p.campaignId]
      return { incomingDmTransfers: next }
    })
  },

  handleDmTransferred: (event) => {
    const p = event.payload as { campaignId: UUID }
    // Clear both directions on completed transfer.
    set((state) => {
      const nextIn = { ...state.incomingDmTransfers }
      const nextOut = { ...state.outgoingDmTransfers }
      delete nextIn[p.campaignId]
      delete nextOut[p.campaignId]
      return { incomingDmTransfers: nextIn, outgoingDmTransfers: nextOut }
    })
  },
})
