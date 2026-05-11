'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.isEventType = exports.sortEventsByTimestamp = exports.getEventType = exports.isEventForSession = void 0
function isEventForSession(event, sessionId) {
  return event.sessionId === sessionId
}
exports.isEventForSession = isEventForSession
function getEventType(event) {
  return event.type
}
exports.getEventType = getEventType
function sortEventsByTimestamp(events) {
  return [...events].sort((a, b) => a.timestamp - b.timestamp)
}
exports.sortEventsByTimestamp = sortEventsByTimestamp
function isEventType(event, allowedTypes) {
  return allowedTypes.includes(event.type)
}
exports.isEventType = isEventType
