'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.sessionStatusClass =
  exports.prettySessionState =
  exports.deriveCampaignDisplayState =
  exports.isSessionLive =
  exports.isGreenroomSessionState =
  exports.toPublicSessionState =
  exports.normalizeSessionState =
    void 0
const index_1 = require('../types/index')
function normalizeSessionState(state) {
  if (!state) return null
  if (state === index_1.SessionState.CLEANUP) return index_1.SessionState.CLEANUP
  if (state === index_1.SessionState.IDLE) return index_1.SessionState.IDLE
  if (state === index_1.SessionState.ACTIVE) return index_1.SessionState.ACTIVE
  if (state === index_1.SessionState.PAUSED) return index_1.SessionState.PAUSED
  if (state === index_1.SessionState.COOLDOWN) return index_1.SessionState.COOLDOWN
  if (state === index_1.SessionState.ENDED) return index_1.SessionState.ENDED
  return null
}
exports.normalizeSessionState = normalizeSessionState
function toPublicSessionState(state) {
  if (!state) return null
  return state
}
exports.toPublicSessionState = toPublicSessionState
function isGreenroomSessionState(state) {
  if (!state) return true
  return (
    state === index_1.SessionState.IDLE ||
    state === index_1.SessionState.ENDED ||
    state === index_1.SessionState.CLEANUP
  )
}
exports.isGreenroomSessionState = isGreenroomSessionState
function isSessionLive(state) {
  if (!state) return false
  return (
    state === index_1.SessionState.ACTIVE ||
    state === index_1.SessionState.PAUSED ||
    state === index_1.SessionState.COOLDOWN
  )
}
exports.isSessionLive = isSessionLive
function deriveCampaignDisplayState(latestSessionState) {
  if (!latestSessionState) return 'IDLE'
  if (latestSessionState === 'ACTIVE') return 'ACTIVE'
  if (latestSessionState === 'PAUSED') return 'PAUSED'
  if (latestSessionState === 'COOLDOWN') return 'COOLDOWN'
  return 'GREENROOM'
}
exports.deriveCampaignDisplayState = deriveCampaignDisplayState
function prettySessionState(state) {
  if (state === 'IDLE') return 'Idle'
  if (state === 'ACTIVE') return 'Active'
  if (state === 'PAUSED') return 'Paused'
  if (state === 'COOLDOWN') return 'Cooldown'
  if (state === 'ENDED') return 'Ended'
  if (state === index_1.SessionState.CLEANUP) return 'Cleanup'
  return 'Unknown'
}
exports.prettySessionState = prettySessionState
function sessionStatusClass(state) {
  if (state === 'ACTIVE') return 'status-active'
  if (state === 'PAUSED') return 'status-paused'
  if (state === 'COOLDOWN') return 'status-cooldown'
  if (state === 'ENDED') return 'status-ended'
  if (state === 'IDLE' || state === index_1.SessionState.CLEANUP) {
    return 'status-idle'
  }
  return 'status-none'
}
exports.sessionStatusClass = sessionStatusClass
