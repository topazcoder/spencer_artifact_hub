import { z } from 'zod';

/** Stable error codes returned by the REST API and surfaced by MCP tool results. */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  ARTIFACT_TOO_LARGE: 'ARTIFACT_TOO_LARGE',
  UNSUPPORTED_TYPE: 'UNSUPPORTED_TYPE',
  UPLOAD_SESSION_EXPIRED: 'UPLOAD_SESSION_EXPIRED',
  UPLOAD_SESSION_USED: 'UPLOAD_SESSION_USED',
  SHARE_RECIPIENT_UNKNOWN: 'SHARE_RECIPIENT_UNKNOWN',
  SHARE_EXPIRED: 'SHARE_EXPIRED',
  SHARE_REVOKED: 'SHARE_REVOKED',
  RATE_LIMITED: 'RATE_LIMITED',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.enum(ErrorCode),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
