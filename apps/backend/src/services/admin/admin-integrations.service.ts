import { listExternalSystems, updateExternalSystem } from '@/services/integrations.service'

// ─── Private Types ─────────────────────────────────────────────────────────────

type IntegrationMutationSuccess = {
  ok: true
  message: string
  system: ReturnType<typeof listExternalSystems>[number]
  audit: {
    action:
      'INTEGRATION_SYSTEM_AUTHORIZE' | 'INTEGRATION_SYSTEM_BLOCK' | 'INTEGRATION_SYSTEM_UPDATE'
    targetType: 'EXTERNAL_SYSTEM'
    targetId: string
    metadata: Record<string, unknown>
  }
}

type IntegrationMutationFailure = {
  ok: false
  code: 'NOT_FOUND'
  message: string
}

type IntegrationMutationResult = IntegrationMutationSuccess | IntegrationMutationFailure

// ─── Integrations ─────────────────────────────────────────────────────────────

export function listAdminIntegrationSystemsPayload(): {
  systems: Array<
    ReturnType<typeof listExternalSystems>[number] & {
      metrics: { linkedUsers: number; requests24h: number; lastSeenAt: null }
    }
  >
} {
  return {
    systems: listExternalSystems().map((system) => ({
      ...system,
      metrics: { linkedUsers: 0, requests24h: 0, lastSeenAt: null },
    })),
  }
}

export function authorizeAdminIntegrationSystem(system: string): IntegrationMutationResult {
  const result = updateExternalSystem(system, { authorizationState: 'AUTHORIZED' })

  if (!result) {
    return { ok: false, code: 'NOT_FOUND', message: 'External system not found' }
  }

  return {
    ok: true,
    message: 'External system authorized',
    system: result.next,
    audit: {
      action: 'INTEGRATION_SYSTEM_AUTHORIZE',
      targetType: 'EXTERNAL_SYSTEM',
      targetId: result.next.system,
      metadata: {
        previousState: result.previous.authorizationState,
        nextState: result.next.authorizationState,
        allowedScopes: result.next.allowedScopes,
      },
    },
  }
}

export function blockAdminIntegrationSystem(system: string): IntegrationMutationResult {
  const result = updateExternalSystem(system, { authorizationState: 'BLOCKED' })

  if (!result) {
    return { ok: false, code: 'NOT_FOUND', message: 'External system not found' }
  }

  return {
    ok: true,
    message: 'External system blocked',
    system: result.next,
    audit: {
      action: 'INTEGRATION_SYSTEM_BLOCK',
      targetType: 'EXTERNAL_SYSTEM',
      targetId: result.next.system,
      metadata: {
        previousState: result.previous.authorizationState,
        nextState: result.next.authorizationState,
        allowedScopes: result.next.allowedScopes,
      },
    },
  }
}

export function updateAdminIntegrationSystem(params: {
  system: string
  body: Record<string, unknown>
}): IntegrationMutationResult {
  const state = String(params.body.authorizationState || '')
    .trim()
    .toUpperCase()
  const authorizationState =
    state === 'AUTHORIZED' || state === 'LOG_ONLY' || state === 'BLOCKED' ? state : undefined

  const result = updateExternalSystem(params.system, {
    authorizationState,
    displayName: params.body.displayName as string | undefined,
    notes: params.body.notes as string | undefined,
    allowedScopes: params.body.allowedScopes as string[] | undefined,
  })

  if (!result) {
    return { ok: false, code: 'NOT_FOUND', message: 'External system not found' }
  }

  return {
    ok: true,
    message: 'External system updated',
    system: result.next,
    audit: {
      action: 'INTEGRATION_SYSTEM_UPDATE',
      targetType: 'EXTERNAL_SYSTEM',
      targetId: result.next.system,
      metadata: {
        previousState: result.previous.authorizationState,
        nextState: result.next.authorizationState,
        previousScopes: result.previous.allowedScopes,
        nextScopes: result.next.allowedScopes,
        previousDisplayName: result.previous.displayName,
        nextDisplayName: result.next.displayName,
      },
    },
  }
}
