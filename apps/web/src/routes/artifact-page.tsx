import { type Artifact, formatBytes } from '@artifact-hub/shared';
import { DownloadIcon, LockIcon, MaximizeIcon } from 'lucide-react';
import { useRef } from 'react';
import { Link, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { typeLabel } from '@/features/artifacts/artifact-types.ts';
import { artifactContentUrl } from '@/features/artifacts/artifacts-api.ts';
import { useArtifact } from '@/features/artifacts/use-artifacts.ts';
import { ArtifactViewer } from '@/features/artifacts/viewers/artifact-viewer.tsx';
import { InlineError, InlineLoading } from '@/components/inline-status.tsx';
import { isApiError } from '@/lib/api/api-error.ts';
import { formatRelativeTime } from '@/lib/format.ts';

export function ArtifactPage() {
  const { id = '' } = useParams();
  const { data: artifact, error, refetch } = useArtifact(id);

  if (isApiError(error, 'NOT_FOUND')) return <ArtifactNotFound />;
  if (error) {
    return (
      <div className="h-[60vh]">
        <InlineError error={error} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (!artifact) {
    return (
      <div className="h-[60vh]">
        <InlineLoading />
      </div>
    );
  }
  return <ArtifactDetails artifact={artifact} />;
}

function ArtifactDetails({ artifact }: { artifact: Artifact }) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const version = artifact.currentVersion;

  return (
    <article className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{artifact.title}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>{artifact.owner.displayName}</span>
            {version ? (
              <>
                <span aria-hidden="true">·</span>
                <span>v{version.versionNo}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {typeLabel(version.mimeType)}, {formatBytes(version.sizeBytes)}
                </span>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <time
              dateTime={artifact.updatedAt}
              title={new Date(artifact.updatedAt).toLocaleString()}
            >
              Updated {formatRelativeTime(artifact.updatedAt)}
            </time>
            {artifact.visibility === 'private' ? (
              <Badge variant="secondary">
                <LockIcon aria-hidden="true" />
                Private
              </Badge>
            ) : (
              <Badge variant="secondary">Public</Badge>
            )}
          </p>
        </div>
        {version ? (
          <div className="flex gap-2">
            {document.fullscreenEnabled ? (
              <Button variant="outline" onClick={() => void viewerRef.current?.requestFullscreen()}>
                <MaximizeIcon aria-hidden="true" />
                Full screen
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <a href={artifactContentUrl(artifact.id, version.versionNo, { download: true })}>
                <DownloadIcon aria-hidden="true" />
                Download
              </a>
            </Button>
          </div>
        ) : null}
      </header>

      {artifact.description || artifact.tags.length > 0 ? (
        <div className="grid gap-3">
          {artifact.description ? (
            <p className="max-w-3xl whitespace-pre-line text-sm">{artifact.description}</p>
          ) : null}
          {artifact.tags.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
              {artifact.tags.map((tag) => (
                <li key={tag}>
                  <Badge variant="outline">{tag}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div
        ref={viewerRef}
        className="h-[75vh] overflow-hidden rounded-xl border bg-background [&:fullscreen]:h-screen [&:fullscreen]:rounded-none [&:fullscreen]:border-0"
      >
        {version ? (
          <ArtifactViewer artifact={artifact} version={version} />
        ) : (
          <InlineError error="This artifact is waiting for its first upload." />
        )}
      </div>
    </article>
  );
}

function ArtifactNotFound() {
  return (
    <section className="flex flex-col items-center gap-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Artifact not found</h1>
      <p className="max-w-md text-muted-foreground">
        It doesn't exist, or it hasn't been shared with you.
      </p>
      <Button asChild variant="outline">
        <Link to="/">Go home</Link>
      </Button>
    </section>
  );
}
