/**
 * CRPC Error - tRPC-style error handling for Convex
 *
 * Extends ConvexError with typed error codes and HTTP status mapping.
 */
import { ConvexError } from 'convex/values';

// =============================================================================
// Error Codes (from tRPC)
// =============================================================================

/** JSON-RPC 2.0 error codes (tRPC-style) */
export const CRPC_ERROR_CODES_BY_KEY = {
  PARSE_ERROR: -32_700,
  BAD_REQUEST: -32_600,
  INTERNAL_SERVER_ERROR: -32_603,
  NOT_IMPLEMENTED: -32_603,
  BAD_GATEWAY: -32_603,
  SERVICE_UNAVAILABLE: -32_603,
  GATEWAY_TIMEOUT: -32_603,
  UNAUTHORIZED: -32_001,
  PAYMENT_REQUIRED: -32_002,
  FORBIDDEN: -32_003,
  NOT_FOUND: -32_004,
  METHOD_NOT_SUPPORTED: -32_005,
  TIMEOUT: -32_008,
  CONFLICT: -32_009,
  PRECONDITION_FAILED: -32_012,
  PAYLOAD_TOO_LARGE: -32_013,
  UNSUPPORTED_MEDIA_TYPE: -32_015,
  UNPROCESSABLE_CONTENT: -32_022,
  PRECONDITION_REQUIRED: -32_028,
  TOO_MANY_REQUESTS: -32_029,
  CLIENT_CLOSED_REQUEST: -32_099,
} as const;

export type CRPCErrorCode = keyof typeof CRPC_ERROR_CODES_BY_KEY;

// =============================================================================
// HTTP Status Code Mapping
// =============================================================================

/** Map error codes to HTTP status codes */
export const CRPC_ERROR_CODE_TO_HTTP: Record<CRPCErrorCode, number> = {
  PARSE_ERROR: 400,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_SUPPORTED: 405,
  TIMEOUT: 408,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE_CONTENT: 422,
  PRECONDITION_REQUIRED: 428,
  TOO_MANY_REQUESTS: 429,
  CLIENT_CLOSED_REQUEST: 499,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
};

// =============================================================================
// CRPCError Class
// =============================================================================

type CRPCErrorData = {
  code: CRPCErrorCode;
  message: string;
};

/** Extract Error from unknown cause (from tRPC) */
function getCauseFromUnknown(cause: unknown): Error | undefined {
  if (cause instanceof Error) return cause;
  if (
    typeof cause === 'undefined' ||
    typeof cause === 'function' ||
    cause === null
  ) {
    return;
  }
  if (typeof cause !== 'object') return new Error(String(cause));
  return;
}

/**
 * tRPC-style error extending ConvexError
 *
 * @example
 * ```typescript
 * throw new CRPCError({
 *   code: 'BAD_REQUEST',
 *   message: 'Invalid input',
 *   cause: originalError,
 * });
 * ```
 */
export class CRPCError extends ConvexError<CRPCErrorData> {
  readonly code: CRPCErrorCode;
  override readonly cause?: Error;

  constructor(opts: {
    code: CRPCErrorCode;
    message?: string;
    cause?: unknown;
  }) {
    const cause = getCauseFromUnknown(opts.cause);
    const message = opts.message ?? cause?.message ?? opts.code;

    super({ code: opts.code, message });

    this.name = 'CRPCError';
    this.code = opts.code;
    this.cause = cause;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Wrap unknown error in CRPCError (from tRPC)
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   throw getCRPCErrorFromUnknown(error);
 * }
 * ```
 */
export function getCRPCErrorFromUnknown(cause: unknown): CRPCError {
  if (cause instanceof CRPCError) return cause;
  if (cause instanceof Error && cause.name === 'CRPCError') {
    return cause as CRPCError;
  }

  const error = new CRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    cause,
  });

  if (cause instanceof Error && cause.stack) {
    error.stack = cause.stack;
  }

  return error;
}

/**
 * Get HTTP status code from CRPCError
 *
 * @example
 * ```typescript
 * const httpStatus = getHTTPStatusCodeFromError(error); // 400
 * ```
 */
export function getHTTPStatusCodeFromError(error: CRPCError): number {
  return CRPC_ERROR_CODE_TO_HTTP[error.code] ?? 500;
}

/** Type guard for CRPCError */
export function isCRPCError(error: unknown): error is CRPCError {
  return error instanceof CRPCError;
}
