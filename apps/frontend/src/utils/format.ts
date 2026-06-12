export { formatTimestamp, formatDuration, truncateText, pluralize } from '@shared'

export function getAuthorInitial(username: string): string {
  return username.trim().charAt(0).toUpperCase() || '?'
}
