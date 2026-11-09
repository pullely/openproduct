// VENDORED from the platform's `packages/contracts/src/errors.ts`
// (openproduct-independence OX6a) — byte-identical below this header, so no
// `@saas/*` import crosses the product boundary. The wire error envelope
// is a seam-visible shape; the vendored copy must not drift.

// Error contract types

export interface ErrorResponse {
  error: string;
  message: string;
  requestId?: string;
}

export interface ValidationErrorResponse extends ErrorResponse {
  error: "validation_failed";
  fields?: Record<string, string[]>;
}

export const ERROR_CODES = {
  BAD_REQUEST: "bad_request",
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  RATE_LIMITED: "rate_limited",
  VALIDATION_FAILED: "validation_failed",
  PRECONDITION_FAILED: "precondition_failed",
  UNSUPPORTED: "unsupported",
  INTERNAL_ERROR: "internal_error",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
