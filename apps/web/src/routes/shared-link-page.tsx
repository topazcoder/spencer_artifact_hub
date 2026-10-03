import { APP_NAME, type SharedArtifactResponse, formatBytes } from '@artifact-hub/shared';
import { DownloadIcon, ExternalLinkIcon, LinkIcon, MaximizeIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router';
import { InlineError, InlineLoading } from '@/components/inline-status.tsx';
import { Button } from '@/components/ui/button.tsx';
import { typeLabel } from '@/features/artifacts/artifact-types.ts';
import { useArtifact } from '@/features/artifacts/use-artifacts.ts';
import { ArtifactViewer } from '@/features/artifacts/viewers/artifact-viewer.tsx';
import { useCurrentUser } from '@/features/auth/use-auth.ts';
import { sharedContentPath } from '@/features/sharing/sharing-api.ts';
import { useSharedArtifact } from '@/features/sharing/use-sharing.ts';
import { isApiError } from '@/lib/api/api-error.ts';

/**
 * `/s/:token`: what a share link shows, to anyone holding it, signed in or not. View and
 * download only; outside the app shell, since visitors may have no account.
 */
export function SharedLinkPage() {
  const { token = '' } = useParams();
  const { data, error, refetch } = useSharedArtifact(token);
  useHiddenPage();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <span className="font-semibold tracking-tight">{APP_NAME}</span>
          {data ? <OpenInApp artifactId={data.artifact.id} /> : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {isApiError(error, 'SHARE_EXPIRED') ? (
          <LinkProblem title="This link has expired" />
        ) : isApiError(error, 'SHARE_REVOKED') ? (
          <LinkProblem title="This link was turned off" />
        ) : isApiError(error, 'NOT_FOUND') ? (
          <LinkProblem title="This link doesn't work" />
        ) : error ? (
          <div className="h-[60vh]">
            <InlineError error={error} onRetry={() => void refetch()} />
          </div>
        ) : data ? (
          <SharedArtifact token={token} shared={data} />
        ) : (
          <div className="h-[60vh]">
            <InlineLoading />
          </div>
        )}
      </main>
    </div>
  );
}

function SharedArtifact({ token, shared }: { token: string; shared: SharedArtifactResponse }) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const { artifact } = shared;
  const { version } = artifact;
  const contentPath = sharedContentPath(token);

  return (
    <article className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{artifact.title}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>Shared by {artifact.owner.displayName}</span>
            <span aria-hidden="true">·</span>
            <span>v{version.versionNo}</span>
            <span aria-hidden="true">·</span>
            <span>
              {typeLabel(version.mimeType)}, {formatBytes(version.sizeBytes)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {document.fullscreenEnabled ? (
            <Button variant="outline" onClick={() => void viewerRef.current?.requestFullscreen()}>
              <MaximizeIcon aria-hidden="true" />
              Full screen
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <a href={`/api${contentPath}?download=1`}>
              <DownloadIcon aria-hidden="true" />
              Download
            </a>
          </Button>
        </div>
      </header>
      {artifact.description ? (
        <p className="max-w-3xl text-sm whitespace-pre-line">{artifact.description}</p>
      ) : null}
      <div
        ref={viewerRef}
        className="h-[75vh] overflow-hidden rounded-xl border bg-background [&:fullscreen]:h-screen [&:fullscreen]:rounded-none [&:fullscreen]:border-0"
      >
        <ArtifactViewer title={artifact.title} version={version} contentPath={contentPath} />
      </div>
    </article>
  );
}

/** For signed-in visitors who can also see the artifact in the app (with comments). */
function OpenInApp({ artifactId }: { artifactId: string }) {
  const { data: user } = useCurrentUser();
  return user ? <OpenInAppIfAllowed artifactId={artifactId} /> : null;
}

function OpenInAppIfAllowed({ artifactId }: { artifactId: string }) {
  const { data: artifact } = useArtifact(artifactId);
  if (!artifact) return null;
  return (
    <Button asChild size="sm" variant="outline">
      <Link to={`/artifacts/${artifactId}`}>
        <ExternalLinkIcon aria-hidden="true" />
        Open in {APP_NAME}
      </Link>
    </Button>
  );
}

function LinkProblem({ title }: { title: string }) {
  return (
    <section className="flex flex-col items-center gap-4 py-24 text-center">
      <LinkIcon className="size-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-md text-muted-foreground">
        Ask the person who shared it with you for a new link.
      </p>
    </section>
  );
}

/** Keeps the page out of search engines, and its URL (the link) out of `Referer` headers. */
function useHiddenPage() {
  useEffect(() => {
    const metas = [
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'referrer', content: 'no-referrer' },
    ].map(({ name, content }) => {
      const meta = document.createElement('meta');
      meta.name = name;
      meta.content = content;
      document.head.append(meta);
      return meta;
    });
    return () => {
      for (const meta of metas) meta.remove();
    };
  }, []);
}
