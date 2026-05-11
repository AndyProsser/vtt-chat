'use strict'
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
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k
        var desc = Object.getOwnPropertyDescriptor(m, k)
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k]
            },
          }
        }
        Object.defineProperty(o, k2, desc)
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k
        o[k2] = m[k]
      })
var __exportStar =
  (this && this.__exportStar) ||
  function (m, exports) {
    for (var p in m)
      if (p !== 'default' && !Object.prototype.hasOwnProperty.call(exports, p))
        __createBinding(exports, m, p)
  }
Object.defineProperty(exports, '__esModule', { value: true })
__exportStar(require('./types'), exports)
__exportStar(require('./events'), exports)
__exportStar(require('./permissions'), exports)
__exportStar(require('./errors'), exports)
__exportStar(require('./validators'), exports)
__exportStar(require('./utils'), exports)
//# sourceMappingURL=index.js.map
