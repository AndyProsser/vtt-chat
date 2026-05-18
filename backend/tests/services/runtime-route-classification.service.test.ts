import { describe, expect, it } from 'vitest'
import {
  WEBSOCKET_VISIBLE_RUNTIME_ROUTE_CLASSIFICATIONS,
  getRuntimeRouteClassification,
} from '@/services/runtime/runtime-route-classification.service'

describe('runtime route classification registry', () => {
  it('classifies representative websocket-visible mutation routes across runtime domains', () => {
    expect(getRuntimeRouteClassification('PUT', '/api/presence/:sessionId/state')).toMatchObject({
      routeClass: 'CLASS_A',
      domain: 'presence',
    })

    expect(getRuntimeRouteClassification('POST', '/api/rooms/:roomId/move-user')).toMatchObject({
      routeClass: 'CLASS_A',
      domain: 'rooms',
    })

    expect(getRuntimeRouteClassification('POST', '/api/audio/environment')).toMatchObject({
      routeClass: 'CLASS_C',
      domain: 'audio',
    })

    expect(getRuntimeRouteClassification('POST', '/api/chat/message')).toMatchObject({
      routeClass: 'CLASS_B',
      domain: 'chat',
    })

    expect(getRuntimeRouteClassification('POST', '/api/notes/:noteId/publish')).toMatchObject({
      routeClass: 'CLASS_B',
      domain: 'notes',
    })

    expect(getRuntimeRouteClassification('PUT', '/api/session/:id/state')).toMatchObject({
      routeClass: 'CLASS_B',
      domain: 'session',
    })
  })

  it('keeps alias routes in the same class as their canonical route', () => {
    for (const entry of WEBSOCKET_VISIBLE_RUNTIME_ROUTE_CLASSIFICATIONS) {
      if (!entry.aliasOf) {
        continue
      }

      const canonical = getRuntimeRouteClassification(entry.method, entry.aliasOf)
      expect(canonical).not.toBeNull()
      expect(entry.routeClass).toBe(canonical?.routeClass)
      expect(entry.domain).toBe(canonical?.domain)
    }
  })

  it('does not allow duplicate method/path entries', () => {
    const keys = WEBSOCKET_VISIBLE_RUNTIME_ROUTE_CLASSIFICATIONS.map(
      (entry) => `${entry.method} ${entry.path}`
    )

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('returns null for unclassified routes', () => {
    expect(getRuntimeRouteClassification('GET', '/api/audio/state/:sessionId')).toBeNull()
    expect(getRuntimeRouteClassification('PATCH', '/api/campaigns/:id/settings')).toBeNull()
  })
})
