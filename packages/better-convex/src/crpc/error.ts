/**
 * Client error codes (subset of CRPC codes for client-side use)
 */
type ClientErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'TOO_MANY_REQUESTS';

/**
 * Client-side CRPC error.
 * Mirrors backend CRPCError pattern with typed error codes.
 */
export class CRPCClientError extends Error {
  readonly name = 'CRPCClientError';
  readonly code: ClientErrorCode;
  readonly functionName: string;

  constructor(opts: {
    code: ClientErrorCode;
    functionName: string;
    message?: string;
  }) {
    super(opts.message ?? `${opts.code}: ${opts.functionName}`);
    this.code = opts.code;
    this.functionName = opts.functionName;
  }
}

/** Type guard for CRPCClientError */
export const isCRPCClientError = (error: unknown): error is CRPCClientError =>
  error instanceof CRPCClientError;

/** Type guard for specific error code */
export const isCRPCErrorCode = (
  error: unknown,
  code: ClientErrorCode
): error is CRPCClientError => isCRPCClientError(error) && error.code === code;
