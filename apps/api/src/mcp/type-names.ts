import type { ArtifactMimeType } from '@artifact-hub/shared';

/** What a model calls each content type when talking to the user. */
const TYPE_NAMES: Record<ArtifactMimeType, string> = {
  'text/html': 'HTML page',
  'text/markdown': 'Markdown document',
  'image/svg+xml': 'SVG image',
  'image/png': 'PNG image',
  'image/jpeg': 'JPEG image',
  'image/webp': 'WebP image',
  'image/gif': 'GIF image',
  'application/pdf': 'PDF',
};

export function typeName(mimeType: ArtifactMimeType): string {
  return TYPE_NAMES[mimeType];
}
