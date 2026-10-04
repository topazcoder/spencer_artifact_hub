import { ErrorCode } from '@artifact-hub/shared';
import { AppError } from '../common/errors/app-error.js';
import type { ToolErrorDetails } from './mcp.types.js';

/** A version the user can't see, with the ones they can: the artifact itself was found. */
export function versionNotFound(versionNo: number, visibleVersionNos: number[]): AppError {
  const details: ToolErrorDetails = {
    hint:
      visibleVersionNos.length === 0
        ? 'It has no versions yet.'
        : `The versions you can see: ${visibleVersionNos.join(', ')}.`,
  };
  return new AppError(ErrorCode.NOT_FOUND, `Version ${versionNo} not found.`, details);
}
