export type RuntimeRouteClass = 'CLASS_A' | 'CLASS_B' | 'CLASS_C'

export interface RuntimeRouteClassification {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  routeClass: RuntimeRouteClass
  domain: 'audio' | 'presence' | 'rooms' | 'session'
  reason: string
  aliasOf?: string
}

function createEntry(entry: RuntimeRouteClassification): RuntimeRouteClassification {
  return entry
}

function normalizeMethod(method: string): RuntimeRouteClassification['method'] {
  return method.trim().toUpperCase() as RuntimeRouteClassification['method']
}

function normalizePath(path: string): string {
  const normalized = path.trim().replace(/\/+/g, '/').replace(/\/$/, '')
  return normalized.length === 0 ? '/' : normalized
}

export const WEBSOCKET_VISIBLE_RUNTIME_ROUTE_CLASSIFICATIONS = [
  createEntry({
    method: 'PUT',
    path: '/api/presence/:sessionId/state',
    routeClass: 'CLASS_A',
    domain: 'presence',
    reason: 'Presence state is Redis-authoritative transient runtime topology.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/presence/:sessionId/recover',
    routeClass: 'CLASS_A',
    domain: 'presence',
    reason: 'Presence recovery repopulates Redis runtime state for reconnect/restart flows.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/rooms',
    routeClass: 'CLASS_C',
    domain: 'rooms',
    reason: 'Campaign/session room creation changes durable room topology and broadcasts updates.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/rooms/session/:sessionId',
    routeClass: 'CLASS_C',
    domain: 'rooms',
    reason: 'Alias for durable room creation route.',
    aliasOf: '/api/rooms',
  }),
  createEntry({
    method: 'POST',
    path: '/api/rooms/:roomId/join',
    routeClass: 'CLASS_A',
    domain: 'rooms',
    reason: 'Room membership updates are Redis-first runtime topology mutations.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/rooms/:roomId/members/join',
    routeClass: 'CLASS_A',
    domain: 'rooms',
    reason: 'Alias for Redis-first room membership join.',
    aliasOf: '/api/rooms/:roomId/join',
  }),
  createEntry({
    method: 'POST',
    path: '/api/rooms/:roomId/leave',
    routeClass: 'CLASS_A',
    domain: 'rooms',
    reason: 'Room leave mutates Redis-first runtime membership and presence projections.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/rooms/:roomId/members/leave',
    routeClass: 'CLASS_A',
    domain: 'rooms',
    reason: 'Alias for Redis-first room membership leave.',
    aliasOf: '/api/rooms/:roomId/leave',
  }),
  createEntry({
    method: 'POST',
    path: '/api/rooms/:roomId/move-user',
    routeClass: 'CLASS_A',
    domain: 'rooms',
    reason: 'Room moves are Redis-first presence and membership transitions.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/rooms/:roomId/members/move',
    routeClass: 'CLASS_A',
    domain: 'rooms',
    reason: 'Alias for Redis-first room member move.',
    aliasOf: '/api/rooms/:roomId/move-user',
  }),
  createEntry({
    method: 'POST',
    path: '/api/rooms/:roomId/end-whisper',
    routeClass: 'CLASS_A',
    domain: 'rooms',
    reason: 'Whisper teardown restores transient runtime room/audio state.',
  }),
  createEntry({
    method: 'DELETE',
    path: '/api/rooms/:roomId',
    routeClass: 'CLASS_C',
    domain: 'rooms',
    reason: 'Group deletion removes durable room topology and emits WS updates.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/audio/environment',
    routeClass: 'CLASS_C',
    domain: 'audio',
    reason:
      'Environment changes are campaign-durable while mirrored into runtime Redis projection.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/audio/environments/apply',
    routeClass: 'CLASS_C',
    domain: 'audio',
    reason: 'Alias for durable environment mutation.',
    aliasOf: '/api/audio/environment',
  }),
  createEntry({
    method: 'POST',
    path: '/api/audio/dm-override/apply',
    routeClass: 'CLASS_A',
    domain: 'audio',
    reason: 'DM overrides are transient runtime audio control state mirrored into Redis.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/audio/overrides/dm/apply',
    routeClass: 'CLASS_A',
    domain: 'audio',
    reason: 'Alias for DM override apply.',
    aliasOf: '/api/audio/dm-override/apply',
  }),
  createEntry({
    method: 'POST',
    path: '/api/audio/dm-override/remove',
    routeClass: 'CLASS_A',
    domain: 'audio',
    reason: 'Removing DM overrides mutates transient runtime audio control state.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/audio/overrides/dm/remove',
    routeClass: 'CLASS_A',
    domain: 'audio',
    reason: 'Alias for DM override remove.',
    aliasOf: '/api/audio/dm-override/remove',
  }),
  createEntry({
    method: 'POST',
    path: '/api/audio/broadcast',
    routeClass: 'CLASS_A',
    domain: 'audio',
    reason: 'Broadcast mode is transient runtime DM voice routing state.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/audio/broadcast/state',
    routeClass: 'CLASS_A',
    domain: 'audio',
    reason: 'Alias for DM broadcast state mutation.',
    aliasOf: '/api/audio/broadcast',
  }),
  createEntry({
    method: 'POST',
    path: '/api/audio/voice-of-god',
    routeClass: 'CLASS_A',
    domain: 'audio',
    reason: 'Legacy broadcast alias for transient runtime voice routing.',
    aliasOf: '/api/audio/broadcast',
  }),
  createEntry({
    method: 'POST',
    path: '/api/audio/mute',
    routeClass: 'CLASS_A',
    domain: 'audio',
    reason: 'Mute toggles change transient runtime presence/audio enforcement state.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/audio/unmute',
    routeClass: 'CLASS_A',
    domain: 'audio',
    reason: 'Unmute toggles change transient runtime presence/audio enforcement state.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/audio/voice-mode',
    routeClass: 'CLASS_A',
    domain: 'audio',
    reason:
      'DM voice mode is transient runtime routing state with optional preference persistence.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/session',
    routeClass: 'CLASS_C',
    domain: 'session',
    reason: 'Session creation provisions durable lifecycle state and topology.',
  }),
  createEntry({
    method: 'PUT',
    path: '/api/session/:id/state',
    routeClass: 'CLASS_B',
    domain: 'session',
    reason: 'Lifecycle transitions are session-durable and immediately WS-visible.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/session/:id/cooldown/extend',
    routeClass: 'CLASS_B',
    domain: 'session',
    reason: 'Cooldown extension mutates durable session lifecycle timing and broadcasts updates.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/session/:id/cooldown/end',
    routeClass: 'CLASS_B',
    domain: 'session',
    reason: 'Cooldown end mutates durable session lifecycle state and broadcasts updates.',
  }),
  createEntry({
    method: 'PATCH',
    path: '/api/session/:id',
    routeClass: 'CLASS_B',
    domain: 'session',
    reason:
      'Session metadata is durable session-scoped state that propagates to connected clients.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/session/:id/join',
    routeClass: 'CLASS_B',
    domain: 'session',
    reason:
      'Session membership join mutates durable membership and triggers runtime presence placement.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/session/:id/members/join',
    routeClass: 'CLASS_B',
    domain: 'session',
    reason: 'Alias for session membership join.',
    aliasOf: '/api/session/:id/join',
  }),
  createEntry({
    method: 'POST',
    path: '/api/session/:id/leave',
    routeClass: 'CLASS_B',
    domain: 'session',
    reason: 'Session membership leave mutates durable membership and runtime participation state.',
  }),
  createEntry({
    method: 'POST',
    path: '/api/session/:id/members/leave',
    routeClass: 'CLASS_B',
    domain: 'session',
    reason: 'Alias for session membership leave.',
    aliasOf: '/api/session/:id/leave',
  }),
  createEntry({
    method: 'DELETE',
    path: '/api/session/:id',
    routeClass: 'CLASS_B',
    domain: 'session',
    reason: 'Session deletion removes durable session state and emits cleanup-visible changes.',
  }),
] as const satisfies readonly RuntimeRouteClassification[]

const ROUTE_CLASSIFICATION_LOOKUP = new Map(
  WEBSOCKET_VISIBLE_RUNTIME_ROUTE_CLASSIFICATIONS.map((entry) => [
    `${entry.method} ${normalizePath(entry.path)}`,
    entry,
  ])
)

export function getRuntimeRouteClassification(
  method: string,
  path: string
): RuntimeRouteClassification | null {
  return (
    ROUTE_CLASSIFICATION_LOOKUP.get(`${normalizeMethod(method)} ${normalizePath(path)}`) ?? null
  )
}
