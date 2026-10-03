import type { Artifact, ArtifactVersion } from '@artifact-hub/shared';
import { lazy, Suspense } from 'react';
import { artifactContentUrl } from '../artifacts-api.ts';
import { viewerKind } from '../artifact-types.ts';
import { HtmlViewer } from './html-viewer.tsx';
import { ImageViewer } from './image-viewer.tsx';
import { InlineLoading } from '@/components/inline-status.tsx';

// Markdown and PDF rendering pull in large libraries; load them only when needed.
const MarkdownViewer = lazy(() => import('./markdown-viewer.tsx'));
const PdfViewer = lazy(() => import('./pdf-viewer.tsx'));

/** Shows a version with the safe viewer for its type. Fills its container. */
export function ArtifactViewer({
  artifact,
  version,
}: {
  artifact: Pick<Artifact, 'id' | 'title'>;
  version: ArtifactVersion;
}) {
  const src = artifactContentUrl(artifact.id, version.versionNo);

  switch (viewerKind(version.mimeType)) {
    case 'iframe':
      return <HtmlViewer src={src} title={artifact.title} />;
    case 'image':
      return <ImageViewer src={src} alt={artifact.title} />;
    case 'markdown':
      return (
        <Suspense fallback={<InlineLoading />}>
          <MarkdownViewer artifactId={artifact.id} versionNo={version.versionNo} />
        </Suspense>
      );
    case 'pdf':
      return (
        <Suspense fallback={<InlineLoading />}>
          <PdfViewer artifactId={artifact.id} versionNo={version.versionNo} />
        </Suspense>
      );
  }
}
