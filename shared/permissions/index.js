"use strict";
/**
 * Permission Matrix
 * Reference: docs/architecture/PERMISSIONS-MATRIX.md
 *
 * Defines all allowed actions per role.
 * DM has full authority, Players have agency + privacy, Spectators are read-only.
 *
 * Permission format:
 *   DOMAIN:ACTION → [Role, Role, ...]
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERMISSION_MATRIX = void 0;
exports.canPerformAction = canPerformAction;
exports.getAllowedActions = getAllowedActions;
exports.getDomainRules = getDomainRules;
exports.PERMISSION_MATRIX = [
    // ============ SESSION LIFECYCLE ============
    {
        domain: 'SESSION',
        action: 'CREATE',
        allowedRoles: ['DM'],
        description: 'Create a new session',
    },
    {
        domain: 'SESSION',
        action: 'START',
        allowedRoles: ['DM'],
        description: 'Transition session from IDLE to ACTIVE',
    },
    {
        domain: 'SESSION',
        action: 'PAUSE',
        allowedRoles: ['DM'],
        description: 'Transition session from ACTIVE to PAUSED',
    },
    {
        domain: 'SESSION',
        action: 'RESUME',
        allowedRoles: ['DM'],
        description: 'Transition session from PAUSED to ACTIVE',
    },
    {
        domain: 'SESSION',
        action: 'END',
        allowedRoles: ['DM'],
        description: 'Transition session from ACTIVE to ENDED (freezes all changes)',
    },
    {
        domain: 'SESSION',
        action: 'ARCHIVE',
        allowedRoles: ['DM'],
        description: 'Archive session for cleanup',
    },
    {
        domain: 'SESSION',
        action: 'VIEW_METADATA',
        allowedRoles: ['DM', 'PLAYER', 'SPECTATOR'],
        description: 'View basic session info (name, state, timestamp)',
    },
    // ============ ROOM MANAGEMENT ============
    {
        domain: 'ROOM',
        action: 'CREATE',
        allowedRoles: ['DM'],
        description: 'Create a new room in the session',
    },
    {
        domain: 'ROOM',
        action: 'DELETE',
        allowedRoles: ['DM'],
        description: 'Delete a room',
    },
    {
        domain: 'ROOM',
        action: 'JOIN',
        allowedRoles: ['DM', 'PLAYER', 'SPECTATOR'],
        description: 'Join a room',
    },
    {
        domain: 'ROOM',
        action: 'LEAVE',
        allowedRoles: ['DM', 'PLAYER', 'SPECTATOR'],
        description: 'Leave a room',
    },
    {
        domain: 'ROOM',
        action: 'INVITE',
        allowedRoles: ['DM'],
        description: 'Invite player to private room',
    },
    {
        domain: 'ROOM',
        action: 'KICK',
        allowedRoles: ['DM'],
        description: 'Remove a player from a room',
    },
    // ============ CHAT ============
    {
        domain: 'CHAT',
        action: 'SEND_IC',
        allowedRoles: ['DM', 'PLAYER'],
        description: 'Send in-character message to room',
    },
    {
        domain: 'CHAT',
        action: 'SEND_OOC',
        allowedRoles: ['DM', 'PLAYER', 'SPECTATOR'],
        description: 'Send out-of-character message to room',
    },
    {
        domain: 'CHAT',
        action: 'SEND_WHISPER',
        allowedRoles: ['DM', 'PLAYER'],
        description: 'Send private whisper to another user (DM-visible, recipient-visible, sender-visible)',
    },
    {
        domain: 'CHAT',
        action: 'SEND_SYSTEM',
        allowedRoles: ['DM'],
        description: 'Send system-generated message',
    },
    {
        domain: 'CHAT',
        action: 'EDIT_OWN_MESSAGE',
        allowedRoles: ['DM', 'PLAYER', 'SPECTATOR'],
        description: 'Edit own messages',
    },
    {
        domain: 'CHAT',
        action: 'EDIT_ANY_MESSAGE',
        allowedRoles: ['DM'],
        description: 'Edit any message in the session (with audit trail)',
    },
    {
        domain: 'CHAT',
        action: 'DELETE_OWN_MESSAGE',
        allowedRoles: ['DM', 'PLAYER', 'SPECTATOR'],
        description: 'Delete own messages',
    },
    {
        domain: 'CHAT',
        action: 'DELETE_ANY_MESSAGE',
        allowedRoles: ['DM'],
        description: 'Delete any message in the session (with audit trail)',
    },
    {
        domain: 'CHAT',
        action: 'VIEW_CHAT_HISTORY',
        allowedRoles: ['DM', 'PLAYER', 'SPECTATOR'],
        description: 'View role-filtered chat history (role-filtered for visibility)',
    },
    // ============ NOTES ============
    {
        domain: 'NOTES',
        action: 'CREATE_PRIVATE',
        allowedRoles: ['DM', 'PLAYER', 'SPECTATOR'],
        description: 'Create private note (only author can view)',
    },
    {
        domain: 'NOTES',
        action: 'CREATE_SHARED',
        allowedRoles: ['DM', 'PLAYER'],
        description: 'Create shared note (all players can view)',
    },
    {
        domain: 'NOTES',
        action: 'CREATE_DM_ONLY',
        allowedRoles: ['DM'],
        description: 'Create DM-only note (hidden from players)',
    },
    {
        domain: 'NOTES',
        action: 'VIEW_OWN',
        allowedRoles: ['DM', 'PLAYER', 'SPECTATOR'],
        description: 'View own notes',
    },
    {
        domain: 'NOTES',
        action: 'VIEW_SHARED',
        allowedRoles: ['DM', 'PLAYER'],
        description: 'View shared notes from other authors',
    },
    {
        domain: 'NOTES',
        action: 'VIEW_DM_ONLY',
        allowedRoles: ['DM'],
        description: 'View DM-only notes',
    },
    {
        domain: 'NOTES',
        action: 'EDIT_OWN',
        allowedRoles: ['DM', 'PLAYER', 'SPECTATOR'],
        description: 'Edit own notes',
    },
    {
        domain: 'NOTES',
        action: 'EDIT_ANY',
        allowedRoles: ['DM'],
        description: 'Edit any note (with audit trail)',
    },
    {
        domain: 'NOTES',
        action: 'DELETE_OWN',
        allowedRoles: ['DM', 'PLAYER', 'SPECTATOR'],
        description: 'Delete own notes',
    },
    {
        domain: 'NOTES',
        action: 'DELETE_ANY',
        allowedRoles: ['DM'],
        description: 'Delete any note (with audit trail)',
    },
    {
        domain: 'NOTES',
        action: 'SHARE',
        allowedRoles: ['DM', 'PLAYER'],
        description: 'Share own note with other players',
    },
    // ============ AUDIO ============
    {
        domain: 'AUDIO',
        action: 'APPLY_EFFECT_PERSONAL',
        allowedRoles: ['PLAYER'],
        description: 'Apply audio effect to own voice',
    },
    {
        domain: 'AUDIO',
        action: 'APPLY_EFFECT_ROOM',
        allowedRoles: ['DM'],
        description: 'Apply audio effect to a user or room (DM-only)',
    },
    {
        domain: 'AUDIO',
        action: 'LOAD_PRESET',
        allowedRoles: ['DM', 'PLAYER'],
        description: 'Load an audio preset',
    },
    {
        domain: 'AUDIO',
        action: 'SET_ENVIRONMENT',
        allowedRoles: ['DM'],
        description: 'Set room audio environment (ambient, reverb, etc.)',
    },
    {
        domain: 'AUDIO',
        action: 'APPLY_OVERRIDE',
        allowedRoles: ['DM'],
        description: 'Apply DM override (mute, gain, gate, filter) to a user',
    },
    {
        domain: 'AUDIO',
        action: 'REMOVE_OVERRIDE',
        allowedRoles: ['DM'],
        description: 'Remove DM override from a user',
    },
    // ============ PRESENCE ============
    {
        domain: 'PRESENCE',
        action: 'UPDATE_OWN',
        allowedRoles: ['DM', 'PLAYER', 'SPECTATOR'],
        description: 'Update own presence state (online, typing, speaking, idle)',
    },
    {
        domain: 'PRESENCE',
        action: 'VIEW',
        allowedRoles: ['DM', 'PLAYER', 'SPECTATOR'],
        description: 'View other users presence (role-filtered)',
    },
    // ============ METADATA ============
    {
        domain: 'METADATA',
        action: 'CREATE',
        allowedRoles: ['DM'],
        description: 'Create metadata card (NPC, location, event, etc.)',
    },
    {
        domain: 'METADATA',
        action: 'VIEW',
        allowedRoles: ['DM', 'PLAYER', 'SPECTATOR'],
        description: 'View metadata (role-filtered)',
    },
    {
        domain: 'METADATA',
        action: 'EDIT',
        allowedRoles: ['DM'],
        description: 'Edit metadata',
    },
    {
        domain: 'METADATA',
        action: 'DELETE',
        allowedRoles: ['DM'],
        description: 'Delete metadata',
    },
    // ============ ADMIN ============
    {
        domain: 'ADMIN',
        action: 'VIEW_AUDIT_LOG',
        allowedRoles: ['DM'],
        description: 'View DM-scoped audit log for this session',
    },
    {
        domain: 'ADMIN',
        action: 'VIEW_USER_LOG',
        allowedRoles: ['DM'],
        description: 'View player actions in this session',
    },
    {
        domain: 'ADMIN',
        action: 'EXPORT_SESSION',
        allowedRoles: ['DM'],
        description: 'Export session transcript and data',
    },
];
/**
 * Helper function to check if a role can perform an action.
 */
function canPerformAction(role, domain, action) {
    const rule = exports.PERMISSION_MATRIX.find((r) => r.domain === domain && r.action === action);
    return rule?.allowedRoles.includes(role) ?? false;
}
/**
 * Get all allowed actions for a specific role.
 */
function getAllowedActions(role) {
    return exports.PERMISSION_MATRIX.filter((rule) => rule.allowedRoles.includes(role)).map((rule) => `${rule.domain}:${rule.action}`);
}
/**
 * Get all rules for a specific domain.
 */
function getDomainRules(domain) {
    return exports.PERMISSION_MATRIX.filter((rule) => rule.domain === domain);
}
//# sourceMappingURL=index.js.map