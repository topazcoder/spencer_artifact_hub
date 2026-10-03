import { type Artifact, type ArtifactVersion, formatBytes } from '@artifact-hub/shared';
import {
  BuildingIcon,
  DownloadIcon,
  LockIcon,
  MaximizeIcon,
  Share2Icon,
  UploadIcon,
} from 'lucide-react';
import { useRef } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { InlineError, InlineLoading } from '@/components/inline-status.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx';
import { ArtifactDetails } from '@/features/artifacts/artifact-details.tsx';
import { typeLabel } from '@/features/artifacts/artifact-types.ts';
import { artifactContentPath, artifactContentUrl } from '@/features/artifacts/artifacts-api.ts';
import { NewVersionDialog } from '@/features/artifacts/new-version-dialog.tsx';
import { useArtifact, useArtifactVersions } from '@/features/artifacts/use-artifacts.ts';
import { VersionList } from '@/features/artifacts/version-list.tsx';
import { ArtifactViewer } from '@/features/artifacts/viewers/artifact-viewer.tsx';
import { ShareDialog } from '@/features/sharing/share-dialog.tsx';
import { isApiError } from '@/lib/api/api-error.ts';
import { formatRelativeTime } from '@/lib/format.ts';

const VERSION_PARAM = /^[1-9]\d{0,8}$/;

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
  return <ArtifactView artifact={artifact} />;
}

/**
 * The version picked with `?v=N`, or the current one. `undefined` while the version list
 * loads, `null` if there's no such version.
 */
function useSelectedVersion(artifact: Artifact): ArtifactVersion | null | undefined {
  const [searchParams] = useSearchParams();
  const param = searchParams.get('v');
  const current = artifact.currentVersion;
  const requested = param !== null && VERSION_PARAM.test(param) ? Number(param) : null;
  const wantsOther = param !== null && requested !== current?.versionNo;
  const { data: versions, error } = useArtifactVersions(artifact.id, { enabled: wantsOther });

  if (!wantsOther) return current;
  if (requested === null || error) return null;
  return versions ? (versions.find((v) => v.versionNo === requested) ?? null) : undefined;
}

function ArtifactView({ artifact }: { artifact: Artifact }) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { permissions } = artifact;
  const current = artifact.currentVersion;
  const version = useSelectedVersion(artifact);

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
              <Badge variant="secondary">
                <BuildingIcon aria-hidden="true" />
                Company
              </Badge>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {permissions.share ? (
            <ShareDialog artifact={artifact}>
              <Button variant="outline">
                <Share2Icon aria-hidden="true" />
                Share
              </Button>
            </ShareDialog>
          ) : null}
          {permissions.edit ? (
            <NewVersionDialog
              artifact={artifact}
              // Show the new version, wherever the page was.
              onPublished={() => void navigate(`/artifacts/${artifact.id}`)}
            >
              <Button variant="outline">
                <UploadIcon aria-hidden="true" />
                Upload new version
              </Button>
            </NewVersionDialog>
          ) : null}
          {version ? (
            <>
              {document.fullscreenEnabled ? (
                <Button
                  variant="outline"
                  onClick={() => void viewerRef.current?.requestFullscreen()}
                >
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
            </>
          ) : null}
        </div>
      </header>

      {version && current && version.versionNo !== current.versionNo ? (
        <p
          role="status"
          className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground"
        >
          You're viewing v{version.versionNo}, an earlier version.{' '}
          <Link to={`/artifacts/${artifact.id}`} className="font-medium text-foreground underline">
            Show the latest (v{current.versionNo})
          </Link>
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div
          ref={viewerRef}
          className="h-[75vh] overflow-hidden rounded-xl border bg-background [&:fullscreen]:h-screen [&:fullscreen]:rounded-none [&:fullscreen]:border-0"
        >
          {version ? (
            <ArtifactViewer
              title={artifact.title}
              version={version}
              contentPath={artifactContentPath(artifact.id, version.versionNo)}
            />
          ) : version === undefined ? (
            <InlineLoading />
          ) : current ? (
            <InlineError error="This version doesn't exist." />
          ) : (
            <InlineError error="This artifact is waiting for its first upload." />
          )}
        </div>

        <aside>
          <Tabs defaultValue="details">
            <TabsList className="w-full">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="versions">Versions</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="pt-2">
              <ArtifactDetails artifact={artifact} />
            </TabsContent>
            <TabsContent value="versions" className="pt-2">
              {current ? (
                <VersionList
                  artifactId={artifact.id}
                  currentVersionNo={current.versionNo}
                  selectedVersionNo={version?.versionNo ?? current.versionNo}
                />
              ) : (
                <p className="text-sm text-muted-foreground">No versions yet.</p>
              )}
            </TabsContent>
          </Tabs>
        </aside>
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
