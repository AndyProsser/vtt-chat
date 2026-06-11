import type { MetadataTemplate } from '@/types/metadata.types'

const SESSION_LOG_ACTION_MAP: Record<string, string> = {
  JOINED: 'participant_joined',
  LEFT: 'participant_left',
  STATE_CHANGED: 'session_state_changed',
}

export function buildSessionMetadataTags(params: {
  state: string
  campaignName?: string | null
}): string[] {
  const tags = [
    `state:${String(params.state || '').toLowerCase()}`,
    params.campaignName
      ? `campaign:${params.campaignName.toLowerCase().replace(/\s+/g, '-')}`
      : null,
    'timeline:session-log',
  ].filter((value): value is string => Boolean(value))

  return Array.from(new Set(tags))
}

export function mapSessionLogEventToAction(eventType: string): string {
  return SESSION_LOG_ACTION_MAP[eventType] || 'event_recorded'
}

export function getMetadataTemplates(): MetadataTemplate[] {
  return [
    {
      id: 'session-state',
      title: 'Session State Summary',
      description: 'Summarize current session state and readiness at a glance.',
      labels: ['session', 'state', 'operations'],
    },
    {
      id: 'encounter-spotlight',
      title: 'Encounter Spotlight',
      description: 'Track focus encounter metadata for recap and timeline review.',
      labels: ['encounter', 'timeline', 'recap'],
    },
    {
      id: 'player-note-index',
      title: 'Player Note Index',
      description: 'Highlight published note themes and collaborator-visible cues.',
      labels: ['notes', 'players', 'visibility'],
    },
  ]
}
