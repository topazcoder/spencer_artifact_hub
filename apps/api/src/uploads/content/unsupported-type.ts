import { ARTIFACT_MIME_TYPES, ErrorCode } from '@artifact-hub/shared';
import { AppError } from '../../common/errors/app-error.js';

const ALLOWED_DESCRIPTION = 'HTML, SVG, Markdown (.md), PNG, JPEG, WebP, GIF and PDF';

/** `UNSUPPORTED_TYPE` with an optional reason, the supported formats and the allowlist. */
export function unsupported(reason?: string): AppError {
  return new AppError(
    ErrorCode.UNSUPPORTED_TYPE,
    `${reason ? `${reason} ` : ''}Supported formats: ${ALLOWED_DESCRIPTION}.`,
    { allowed: ARTIFACT_MIME_TYPES },
  );
}
