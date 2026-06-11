/**
 * Shared Validators
 * Used by backend (REST input validation, event validation) and frontend (pre-submit validation).
 * Validators are deterministic, side-effect-free, and return validation results.
 */
import type { UUID, MessageType, NoteVisibility, PresenceState } from '../types';
import type { ValidationResult, ValidationError } from '../events/base';
/**
 * UUID validator: checks if string is a valid UUID v4.
 */
export declare function isValidUUID(value: unknown): value is UUID;
/**
 * Username validator: alphanumeric + underscore, 3-32 chars.
 */
export declare function isValidUsername(value: unknown): boolean;
/**
 * Session name validator: 1-100 chars, no control characters.
 */
export declare function isValidSessionName(value: unknown): boolean;
/**
 * Room name validator: 1-100 chars, no control characters.
 */
export declare function isValidRoomName(value: unknown): boolean;
/**
 * Message content validator: 1-4000 chars, no control characters.
 */
export declare function isValidMessageContent(value: unknown): boolean;
/**
 * Note content validator: 1-50000 chars.
 */
export declare function isValidNoteContent(value: unknown): boolean;
/**
 * Note title validator: 1-200 chars.
 */
export declare function isValidNoteTitle(value: unknown): boolean;
/**
 * Tag validator: 1-50 chars, alphanumeric + underscore/hyphen.
 */
export declare function isValidTag(value: unknown): boolean;
/**
 * Message type validator: must be one of allowed types.
 */
export declare function isValidMessageType(value: unknown): value is MessageType;
/**
 * Note visibility validator.
 */
export declare function isValidNoteVisibility(value: unknown): value is NoteVisibility;
/**
 * Presence state validator.
 */
export declare function isValidPresenceState(value: unknown): value is PresenceState;
/**
 * Event envelope structure validator.
 */
export declare function validateEventEnvelope(event: unknown): ValidationResult;
/**
 * Event type name validator: must be DOMAIN:ACTION format.
 */
export declare function isValidEventType(value: unknown): value is string;
/**
 * Timestamp validator: must be within acceptable skew (±5 minutes).
 */
export declare function isValidTimestamp(timestamp: number, now?: number): boolean;
/**
 * Batch validation: collect all errors for a request.
 */
export interface FieldValidation {
    field: string;
    valid: boolean;
    error?: string;
}
export declare function validateFields(data: Record<string, any>, schema: Record<string, (value: any) => boolean>): FieldValidation[];
/**
 * Check if all field validations passed.
 */
export declare function allFieldsValid(validations: FieldValidation[]): boolean;
/**
 * Get all errors from field validations.
 */
export declare function getFieldErrors(validations: FieldValidation[]): ValidationError[];
