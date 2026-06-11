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
import type { Role } from '../types';
export type RoleKey = 'DM' | 'PLAYER' | 'SPECTATOR';
export interface PermissionRule {
    domain: string;
    action: string;
    allowedRoles: RoleKey[];
    description: string;
}
export declare const PERMISSION_MATRIX: PermissionRule[];
/**
 * Helper function to check if a role can perform an action.
 */
export declare function canPerformAction(role: Role, domain: string, action: string): boolean;
/**
 * Get all allowed actions for a specific role.
 */
export declare function getAllowedActions(role: Role): string[];
/**
 * Get all rules for a specific domain.
 */
export declare function getDomainRules(domain: string): PermissionRule[];
