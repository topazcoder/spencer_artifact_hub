import type { ArtifactVersion } from '@artifact-hub/shared';
import { lazy, Suspense } from 'react';
import { viewerKind } from '../artifact-types.ts';
import { HtmlViewer } from './html-viewer.tsx';
import { ImageViewer } from './image-viewer.tsx';
import { InlineLoading } from '@/components/inline-status.tsx';

// Markdown and PDF rendering pull in large libraries; load them only when needed.
const MarkdownViewer = lazy(() => import('./markdown-viewer.tsx'));
const PdfViewer = lazy(() => import('./pdf-viewer.tsx'));

/**
 * Shows a version with the safe viewer for its type. Fills its container. `contentPath` is
 * where its bytes are, relative to `/api` (in the app, or through a share link).
 */
export function ArtifactViewer({
  title,
  version,
  contentPath,
}: {
  title: string;
  version: ArtifactVersion;
  contentPath: string;
}) {
  const src = `/api${contentPath}`;

  switch (viewerKind(version.mimeType)) {
    case 'iframe':
      return <HtmlViewer src={src} title={title} />;
    case 'image':
      return <ImageViewer src={src} alt={title} />;
    case 'markdown':
      return (
        <Suspense fallback={<InlineLoading />}>
          <MarkdownViewer contentPath={contentPath} />
        </Suspense>
      );
    case 'pdf':
      return (
        <Suspense fallback={<InlineLoading />}>
          <PdfViewer contentPath={contentPath} />
        </Suspense>
      );
  }
}
