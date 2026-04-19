'use strict'
/**
 * Shared Types Index
 * Export all core types used across backend, frontend, and admin.
 */
Object.defineProperty(exports, '__esModule', { value: true })
exports.PresenceState =
  exports.MessageType =
  exports.NoteVisibility =
  exports.RoomType =
  exports.SessionState =
  exports.Role =
    void 0
var Role
;(function (Role) {
  Role['DM'] = 'DM'
  Role['PLAYER'] = 'PLAYER'
  Role['SPECTATOR'] = 'SPECTATOR'
  Role['SYSTEM'] = 'SYSTEM'
})(Role || (exports.Role = Role = {}))
var SessionState
;(function (SessionState) {
  SessionState['IDLE'] = 'IDLE'
  SessionState['ACTIVE'] = 'ACTIVE'
  SessionState['PAUSED'] = 'PAUSED'
  SessionState['ENDED'] = 'ENDED'
})(SessionState || (exports.SessionState = SessionState = {}))
var RoomType
;(function (RoomType) {
  RoomType['MAIN'] = 'MAIN'
  RoomType['GROUP'] = 'GROUP'
  RoomType['PRIVATE'] = 'PRIVATE'
})(RoomType || (exports.RoomType = RoomType = {}))
var NoteVisibility
;(function (NoteVisibility) {
  NoteVisibility['DM_ONLY'] = 'DM_ONLY'
  NoteVisibility['PLAYERS_VISIBLE'] = 'PLAYERS_VISIBLE'
  NoteVisibility['CUSTOM'] = 'CUSTOM'
})(NoteVisibility || (exports.NoteVisibility = NoteVisibility = {}))
var MessageType
;(function (MessageType) {
  MessageType['IC'] = 'IC'
  MessageType['OOC'] = 'OOC'
  MessageType['WHISPER'] = 'WHISPER'
  MessageType['SYSTEM'] = 'SYSTEM'
})(MessageType || (exports.MessageType = MessageType = {}))
var PresenceState
;(function (PresenceState) {
  PresenceState['ONLINE'] = 'ONLINE'
  PresenceState['TYPING'] = 'TYPING'
  PresenceState['SPEAKING'] = 'SPEAKING'
  PresenceState['IDLE'] = 'IDLE'
  PresenceState['OFFLINE'] = 'OFFLINE'
})(PresenceState || (exports.PresenceState = PresenceState = {}))
//# sourceMappingURL=index.js.map
