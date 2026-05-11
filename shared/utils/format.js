'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.pluralize = exports.truncateText = exports.formatDuration = exports.formatTimestamp = void 0
function formatTimestamp(timestamp, locale = 'en-US') {
  return new Date(timestamp).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
exports.formatTimestamp = formatTimestamp
function formatDuration(ms) {
  if (ms <= 0) return '0s'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}
exports.formatDuration = formatDuration
function truncateText(value, maxLength = 80) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`
}
exports.truncateText = truncateText
function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural
}
exports.pluralize = pluralize
