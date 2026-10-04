import { ARTIFACT_MIME_TYPES, ErrorCode } from '@artifact-hub/shared';
import { AppError } from '../../common/errors/app-error.js';
import type { UnsupportedContentDetails, UnsupportedContentReason } from './content.types.js';

const ALLOWED_DESCRIPTION = 'HTML, SVG, Markdown (.md), PNG, JPEG, WebP, GIF and PDF';

/** `UNSUPPORTED_TYPE`: the message for the web app, and the reason for other clients. */
export function unsupported(reason: UnsupportedContentReason, explanation?: string): AppError {
  const details: UnsupportedContentDetails = { reason, allowed: ARTIFACT_MIME_TYPES };
  return new AppError(
    ErrorCode.UNSUPPORTED_TYPE,
    `${explanation ?? "This type of file isn't supported."} Supported formats: ${ALLOWED_DESCRIPTION}.`,
    details,
  );
}
