/**
 * Error Model
 * Reference: docs/architecture/ERROR-MODEL.md
 *
 * Standardized error codes and formatting for all API responses and events.
 * Every error must have a code, message, and optional context.
 */
export declare enum ErrorCode {
    INVALID_INPUT = "INVALID_INPUT",
    INVALID_EVENT = "INVALID_EVENT",
    INVALID_PAYLOAD = "INVALID_PAYLOAD",
    INVALID_SESSION = "INVALID_SESSION",
    INVALID_ROOM = "INVALID_ROOM",
    INVALID_USER = "INVALID_USER",
    INVALID_MESSAGE_ID = "INVALID_MESSAGE_ID",
    INVALID_NOTE_ID = "INVALID_NOTE_ID",
    MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
    UNAUTHORIZED = "UNAUTHORIZED",
    FORBIDDEN = "FORBIDDEN",
    PERMISSION_DENIED = "PERMISSION_DENIED",
    INVALID_TOKEN = "INVALID_TOKEN",
    TOKEN_EXPIRED = "TOKEN_EXPIRED",
    INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS",
    NOT_FOUND = "NOT_FOUND",
    SESSION_NOT_FOUND = "SESSION_NOT_FOUND",
    ROOM_NOT_FOUND = "ROOM_NOT_FOUND",
    USER_NOT_FOUND = "USER_NOT_FOUND",
    MESSAGE_NOT_FOUND = "MESSAGE_NOT_FOUND",
    NOTE_NOT_FOUND = "NOTE_NOT_FOUND",
    CONFLICT = "CONFLICT",
    SESSION_ALREADY_ACTIVE = "SESSION_ALREADY_ACTIVE",
    SESSION_ALREADY_ENDED = "SESSION_ALREADY_ENDED",
    SESSION_NOT_ACTIVE = "SESSION_NOT_ACTIVE",
    ROOM_ALREADY_CREATED = "ROOM_ALREADY_CREATED",
    USER_ALREADY_IN_ROOM = "USER_ALREADY_IN_ROOM",
    USER_NOT_IN_ROOM = "USER_NOT_IN_ROOM",
    INVALID_STATE_TRANSITION = "INVALID_STATE_TRANSITION",
    NETWORK_ERROR = "NETWORK_ERROR",
    CONNECTION_FAILED = "CONNECTION_FAILED",
    WEBSOCKET_ERROR = "WEBSOCKET_ERROR",
    TIMEOUT = "TIMEOUT",
    DISCONNECTED = "DISCONNECTED",
    INTERNAL_ERROR = "INTERNAL_ERROR",
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED",
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
    DATABASE_ERROR = "DATABASE_ERROR",
    RATE_LIMITED = "RATE_LIMITED",
    TOO_MANY_REQUESTS = "TOO_MANY_REQUESTS"
}
/**
 * Standard error response shape.
 * Every API error, WebSocket error, and internal error uses this format.
 */
export interface AppError {
    code: ErrorCode;
    message: string;
    /** HTTP status code (for REST responses) */
    status?: number;
    /** Additional context about the error */
    context?: Record<string, any>;
    /** Unique error ID for logging and tracking */
    errorId?: string;
    /** For development: stack trace (never sent to client in production) */
    stack?: string;
}
/**
 * Error metadata for logging and monitoring.
 */
export interface ErrorMetadata {
    code: ErrorCode;
    message: string;
    userId?: string;
    sessionId?: string;
    roomId?: string;
    timestamp: number;
    duration?: number;
    endpoint?: string;
    method?: string;
    statusCode?: number;
}
/**
 * Error catalog: pre-defined errors with messages.
 * Use these to create AppError instances consistently.
 */
export declare const ERROR_CATALOG: Record<ErrorCode, {
    message: string;
    status: number;
}>;
/**
 * Factory function to create a standardized error.
 */
export declare function createError(code: ErrorCode, overrides?: Partial<AppError>): AppError;
/**
 * Check if an error is a specific type.
 */
export declare function isError(value: any, code: ErrorCode): value is AppError;
