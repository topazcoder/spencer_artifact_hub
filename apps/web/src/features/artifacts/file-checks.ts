import { formatBytes } from '@artifact-hub/shared';

/** Why `file` can't be uploaded, checked before sending it; the server checks again. */
export function fileProblem(file: File, maxBytes: number | undefined): string | undefined {
  if (file.size === 0) return 'This file is empty.';
  if (maxBytes && file.size > maxBytes) {
    return `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`;
  }
  return undefined;
}
