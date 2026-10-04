import {
  ARTIFACT_TITLE_MAX_LENGTH,
  type ArtifactListScope,
  type ArtifactMimeType,
  type ArtifactTypeFilter,
} from '@artifact-hub/shared';

/** How a type is displayed: `iframe` (sandboxed document), `image`, `markdown` or `pdf`. */
export type ViewerKind = 'iframe' | 'image' | 'markdown' | 'pdf';

interface TypeInfo {
  label: string;
  viewer: ViewerKind;
}

const TYPES: Record<ArtifactMimeType, TypeInfo> = {
  'text/html': { label: 'HTML', viewer: 'iframe' },
  // An <img> never runs an SVG's scripts, and renders the image the same.
  'image/svg+xml': { label: 'SVG', viewer: 'image' },
  'text/markdown': { label: 'Markdown', viewer: 'markdown' },
  'image/png': { label: 'PNG', viewer: 'image' },
  'image/jpeg': { label: 'JPEG', viewer: 'image' },
  'image/webp': { label: 'WebP', viewer: 'image' },
  'image/gif': { label: 'GIF', viewer: 'image' },
  'application/pdf': { label: 'PDF', viewer: 'pdf' },
};

/** Labels of the gallery's type filter. */
export const TYPE_FILTER_LABELS: Record<ArtifactTypeFilter, string> = {
  html: 'HTML',
  image: 'Images',
  pdf: 'PDF',
  markdown: 'Markdown',
  svg: 'SVG',
};

/** Labels of the gallery's scope filter. */
export const SCOPE_LABELS: Record<ArtifactListScope, string> = {
  mine: 'My artifacts',
  shared: 'Shared with me',
  public: 'Company',
};

export function typeLabel(mimeType: ArtifactMimeType): string {
  return TYPES[mimeType].label;
}

export function viewerKind(mimeType: ArtifactMimeType): ViewerKind {
  return TYPES[mimeType].viewer;
}

/** For the file picker's `accept`. Only a hint: the server decides the real type. */
export const FILE_INPUT_ACCEPT = [
  '.html',
  '.htm',
  '.svg',
  '.md',
  '.markdown',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.pdf',
].join(',');

export const SUPPORTED_FORMATS_LABEL = 'HTML, SVG, Markdown, PNG, JPEG, WebP, GIF or PDF';

/** The default title for an uploaded file: its name without the extension, within the limit. */
export function titleFromFilename(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return (dot > 0 ? filename.slice(0, dot) : filename).trim().slice(0, ARTIFACT_TITLE_MAX_LENGTH);
}
