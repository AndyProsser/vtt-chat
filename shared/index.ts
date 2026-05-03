/**
 * VTT-Chat Shared Types & Contracts
 *
 * Monorepo shared package: types, events, permissions, errors, and validators.
 * Used by backend and frontend to ensure type safety and contract alignment.
 *
 * Structure:
 * - types/: Core domain types (Role, SessionState, User, Session, Room, etc.)
 * - events/: Event schemas for all subsystems (Chat, Session, Room, Presence, Notes, Audio)
 * - permissions/: Permission matrix and authorization helpers
 * - errors/: Error codes, catalog, and error factory functions
 * - validators/: Input validation and event validation functions (pure, side-effect-free)
 */

export * from './types/index'
export * from './events/index'
export * from './permissions/index'
export * from './errors/index'
export * from './validators/index'
export * from './utils/index'
