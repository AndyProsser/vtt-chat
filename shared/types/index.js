'use strict'
/**
 * Shared Types Index
 * Export all core types used across backend, frontend, and admin.
 */
Object.defineProperty(exports, '__esModule', { value: true })
exports.StatusColorKey =
  exports.StatusIconState =
  exports.StatusContext =
  exports.LiveKitConnectionState =
  exports.CoreWsState =
  exports.DeviceClass =
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
  SessionState['COOLDOWN'] = 'COOLDOWN'
  SessionState['ENDED'] = 'ENDED'
  SessionState['CLEANUP'] = 'CLEANUP'
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
var DeviceClass
;(function (DeviceClass) {
  DeviceClass['DESKTOP'] = 'DESKTOP'
  DeviceClass['MOBILE'] = 'MOBILE'
  DeviceClass['TABLET'] = 'TABLET'
})(DeviceClass || (exports.DeviceClass = DeviceClass = {}))
var CoreWsState
;(function (CoreWsState) {
  CoreWsState['CONNECTED'] = 'CONNECTED'
  CoreWsState['CONNECTING'] = 'CONNECTING'
  CoreWsState['ERROR'] = 'ERROR'
})(CoreWsState || (exports.CoreWsState = CoreWsState = {}))
var LiveKitConnectionState
;(function (LiveKitConnectionState) {
  LiveKitConnectionState['CONNECTED'] = 'CONNECTED'
  LiveKitConnectionState['CONNECTING'] = 'CONNECTING'
  LiveKitConnectionState['ERROR'] = 'ERROR'
  LiveKitConnectionState['NOT_APPLICABLE'] = 'NOT_APPLICABLE'
})(LiveKitConnectionState || (exports.LiveKitConnectionState = LiveKitConnectionState = {}))
var StatusContext
;(function (StatusContext) {
  StatusContext['OUTSIDE_CAMPAIGN'] = 'OUTSIDE_CAMPAIGN'
  StatusContext['INSIDE_CAMPAIGN'] = 'INSIDE_CAMPAIGN'
})(StatusContext || (exports.StatusContext = StatusContext = {}))
var StatusIconState
;(function (StatusIconState) {
  StatusIconState['OK'] = 'OK'
  StatusIconState['OK_PARTIAL'] = 'OK_PARTIAL'
  StatusIconState['CONNECTING'] = 'CONNECTING'
  StatusIconState['DEGRADED_AUDIO'] = 'DEGRADED_AUDIO'
  StatusIconState['ERROR'] = 'ERROR'
})(StatusIconState || (exports.StatusIconState = StatusIconState = {}))
var StatusColorKey
;(function (StatusColorKey) {
  StatusColorKey['GREEN'] = 'GREEN'
  StatusColorKey['PALE_GREEN'] = 'PALE_GREEN'
  StatusColorKey['YELLOW'] = 'YELLOW'
  StatusColorKey['ORANGE'] = 'ORANGE'
  StatusColorKey['RED'] = 'RED'
})(StatusColorKey || (exports.StatusColorKey = StatusColorKey = {}))
//# sourceMappingURL=index.js.map
