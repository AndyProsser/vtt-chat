export function formatTimestamp(timestamp: number, locale = 'en-US'): string {
  return new Date(timestamp).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '0s'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function truncateText(value: string, maxLength = 80): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural
}

const SESSION_NAME_DATE_FRAGMENT = '(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{4})'
const CANONICAL_SESSION_NAME_PATTERN = new RegExp(
  `^(?<base>.*?)\\s+#\\d+\\s*-\\s*${SESSION_NAME_DATE_FRAGMENT}\\s*$`,
  'u'
)
const LEGACY_NUMBERED_SESSION_NAME_PATTERN = new RegExp(
  `^(?<base>.*?)\\s+\\d+\\s*-\\s*${SESSION_NAME_DATE_FRAGMENT}\\s*$`,
  'u'
)
const SIMPLE_SESSION_NAME_PATTERN = new RegExp(
  `^(?<base>.*?)\\s*-\\s*${SESSION_NAME_DATE_FRAGMENT}\\s*$`,
  'u'
)
const LEGACY_PAREN_SUFFIX_PATTERN = /^(.+?)\s*\((\d{4}-\d{2}-\d{2})(?:\s+\d+)?\)\s*$/u

/**
 * Formats the human-readable date suffix used in generated campaign session names.
 */
export function formatCampaignSessionDate(date: Date | number | string = new Date()): string {
  const resolvedDate = date instanceof Date ? date : new Date(date)
  const safeDate = Number.isNaN(resolvedDate.getTime()) ? new Date() : resolvedDate

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(safeDate)
}

/**
 * Removes generated numbering/date suffixes so callers can recover the intended session-name base.
 */
export function normalizeCampaignSessionBaseName(value: string, fallback = 'Session'): string {
  let normalizedValue = value.trim()

  if (!normalizedValue) {
    return fallback
  }

  while (true) {
    const nextValue =
      CANONICAL_SESSION_NAME_PATTERN.exec(normalizedValue)?.groups?.base?.trim() ||
      LEGACY_NUMBERED_SESSION_NAME_PATTERN.exec(normalizedValue)?.groups?.base?.trim() ||
      SIMPLE_SESSION_NAME_PATTERN.exec(normalizedValue)?.groups?.base?.trim() ||
      LEGACY_PAREN_SUFFIX_PATTERN.exec(normalizedValue)?.[1]?.trim() ||
      normalizedValue

    if (nextValue === normalizedValue) {
      break
    }

    normalizedValue = nextValue
  }

  return normalizedValue || fallback
}

/**
 * Builds the default generated campaign session name shown and persisted for routine session starts.
 */
export function buildCampaignSessionName(params: {
  baseName: string
  sessionNumber: number
  date?: Date | number | string
}): string {
  const resolvedBaseName = normalizeCampaignSessionBaseName(params.baseName)
  const resolvedSessionNumber = Number.isFinite(params.sessionNumber)
    ? Math.max(1, Math.floor(params.sessionNumber))
    : 1

  return `${resolvedBaseName} #${resolvedSessionNumber} - ${formatCampaignSessionDate(params.date)}`
}
