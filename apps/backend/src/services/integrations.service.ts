import type {
  ExternalSystemKey,
  IntegrationAuthorizationState,
  IntegrationScope,
  ExternalSystemRecord,
} from '@/types/integrations.types'

interface ExternalSystemDefinition {
  system: ExternalSystemKey
  displayName: string
  authCapable: boolean
  logIngestionCapable: boolean
  metadataSyncCapable: boolean
}

const SYSTEM_DEFINITIONS: ExternalSystemDefinition[] = [
  {
    system: 'dndbeyond',
    displayName: 'D&D Beyond',
    authCapable: true,
    logIngestionCapable: true,
    metadataSyncCapable: true,
  },
  {
    system: 'roll20',
    displayName: 'Roll20',
    authCapable: false,
    logIngestionCapable: true,
    metadataSyncCapable: false,
  },
  {
    system: 'foundry',
    displayName: 'Foundry VTT',
    authCapable: false,
    logIngestionCapable: true,
    metadataSyncCapable: false,
  },
  {
    system: 'fantasygrounds',
    displayName: 'Fantasy Grounds',
    authCapable: false,
    logIngestionCapable: false,
    metadataSyncCapable: false,
  },
  {
    system: 'owlbear',
    displayName: 'Owlbear Rodeo',
    authCapable: false,
    logIngestionCapable: false,
    metadataSyncCapable: false,
  },
]

function getAllowedScopes(
  definition: ExternalSystemDefinition,
  state: IntegrationAuthorizationState
): IntegrationScope[] {
  if (state === 'BLOCKED') {
    return []
  }

  if (state === 'LOG_ONLY') {
    return definition.logIngestionCapable ? ['log_ingestion'] : []
  }

  const scopes: IntegrationScope[] = []
  if (definition.authCapable) scopes.push('auth')
  if (definition.logIngestionCapable) scopes.push('log_ingestion')
  if (definition.metadataSyncCapable) scopes.push('metadata_sync')
  return scopes
}

/**
 * Maps ExternalSystemKey values to their SupportedPlatform equivalents used on
 * campaigns. Systems without a campaign-level platform entry return null.
 */
const EXTERNAL_SYSTEM_TO_PLATFORM: Partial<Record<ExternalSystemKey, string>> = {
  dndbeyond: 'DDB',
  roll20: 'ROLL20',
  foundry: 'FOUNDRY',
}

export function externalSystemToPlatform(system: string): string | null {
  const key = system.trim().toLowerCase() as ExternalSystemKey
  return EXTERNAL_SYSTEM_TO_PLATFORM[key] ?? null
}

function buildInitialState(): Map<ExternalSystemKey, ExternalSystemRecord> {
  const now = new Date().toISOString()
  const map = new Map<ExternalSystemKey, ExternalSystemRecord>()

  SYSTEM_DEFINITIONS.forEach((definition) => {
    // Auth-capable systems default to AUTHORIZED so the campaign-level
    // supportedPlatforms gate is the effective control. Admins can explicitly
    // BLOCK a system to override all campaign settings.
    const defaultState: IntegrationAuthorizationState = definition.authCapable
      ? 'AUTHORIZED'
      : 'BLOCKED'
    map.set(definition.system, {
      system: definition.system,
      displayName: definition.displayName,
      authCapable: definition.authCapable,
      logIngestionCapable: definition.logIngestionCapable,
      metadataSyncCapable: definition.metadataSyncCapable,
      authorizationState: defaultState,
      allowedScopes: getAllowedScopes(definition, defaultState),
      notes: '',
      lastUpdatedAt: now,
    })
  })

  return map
}

let integrationsState = buildInitialState()

function normalizeScopes(
  definition: ExternalSystemDefinition,
  scopes: unknown
): IntegrationScope[] {
  if (!Array.isArray(scopes)) {
    return []
  }

  const allowed = new Set<IntegrationScope>()
  for (const raw of scopes) {
    const scope = String(raw || '').trim() as IntegrationScope
    if (scope === 'auth' && definition.authCapable) {
      allowed.add('auth')
    }
    if (scope === 'log_ingestion' && definition.logIngestionCapable) {
      allowed.add('log_ingestion')
    }
    if (scope === 'metadata_sync' && definition.metadataSyncCapable) {
      allowed.add('metadata_sync')
    }
  }

  return Array.from(allowed)
}

export function listExternalSystems(): ExternalSystemRecord[] {
  return Array.from(integrationsState.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  )
}

export function getExternalSystem(system: string): ExternalSystemRecord | null {
  const key = system.trim().toLowerCase() as ExternalSystemKey
  return integrationsState.get(key) || null
}

export function isExternalSystemAuthAllowed(system: string): boolean {
  const entry = getExternalSystem(system)
  if (!entry) return false
  return entry.authorizationState === 'AUTHORIZED' && entry.allowedScopes.includes('auth')
}

export function isExternalSystemLogIngestionAllowed(system: string): boolean {
  const entry = getExternalSystem(system)
  if (!entry) return false
  return (
    entry.authorizationState !== 'BLOCKED' &&
    entry.allowedScopes.includes('log_ingestion') &&
    entry.logIngestionCapable
  )
}

export function updateExternalSystem(
  system: string,
  patch: {
    authorizationState?: IntegrationAuthorizationState
    displayName?: string
    notes?: string
    allowedScopes?: unknown
  }
): { previous: ExternalSystemRecord; next: ExternalSystemRecord } | null {
  const key = system.trim().toLowerCase() as ExternalSystemKey
  const existing = integrationsState.get(key)
  const definition = SYSTEM_DEFINITIONS.find((item) => item.system === key)

  if (!existing || !definition) {
    return null
  }

  const nextState = patch.authorizationState || existing.authorizationState
  const next: ExternalSystemRecord = {
    ...existing,
    authorizationState: nextState,
    displayName:
      typeof patch.displayName === 'string' && patch.displayName.trim()
        ? patch.displayName.trim()
        : existing.displayName,
    notes: typeof patch.notes === 'string' ? patch.notes.trim().slice(0, 800) : existing.notes,
    lastUpdatedAt: new Date().toISOString(),
    allowedScopes: existing.allowedScopes,
  }

  if (patch.allowedScopes !== undefined) {
    next.allowedScopes = normalizeScopes(definition, patch.allowedScopes)
  }

  if (patch.authorizationState) {
    const defaultScopesForState = getAllowedScopes(definition, next.authorizationState)
    if (patch.allowedScopes === undefined) {
      next.allowedScopes = defaultScopesForState
    } else {
      const explicitScopes = normalizeScopes(definition, patch.allowedScopes)
      next.allowedScopes = explicitScopes.filter((scope) => defaultScopesForState.includes(scope))
    }
  }

  integrationsState.set(key, next)
  return {
    previous: existing,
    next,
  }
}

export function resetExternalSystemsRegistryForTests(): void {
  integrationsState = buildInitialState()
}
