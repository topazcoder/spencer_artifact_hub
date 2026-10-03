import { type ArtifactVersion, formatBytes } from '@artifact-hub/shared';
import { Link } from 'react-router';
import { InlineError, InlineLoading } from '@/components/inline-status.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { formatRelativeTime } from '@/lib/format.ts';
import { cn } from '@/lib/utils';
import { typeLabel } from './artifact-types.ts';
import { useArtifactVersions } from './use-artifacts.ts';

/** Every version, newest first; each links to the artifact page showing that version. */
export function VersionList({
  artifactId,
  currentVersionNo,
  selectedVersionNo,
}: {
  artifactId: string;
  currentVersionNo: number;
  selectedVersionNo: number;
}) {
  const { data: versions, error, refetch } = useArtifactVersions(artifactId);

  if (error) return <InlineError error={error} onRetry={() => void refetch()} />;
  if (!versions) return <InlineLoading />;

  return (
    <ol className="grid gap-1" aria-label="Versions">
      {versions.map((version) => (
        <li key={version.id}>
          <VersionItem
            artifactId={artifactId}
            version={version}
            current={version.versionNo === currentVersionNo}
            selected={version.versionNo === selectedVersionNo}
          />
        </li>
      ))}
    </ol>
  );
}

function VersionItem({
  artifactId,
  version,
  current,
  selected,
}: {
  artifactId: string;
  version: ArtifactVersion;
  current: boolean;
  selected: boolean;
}) {
  return (
    <Link
      // The current version has the artifact's plain URL.
      to={current ? `/artifacts/${artifactId}` : `/artifacts/${artifactId}?v=${version.versionNo}`}
      aria-current={selected ? 'page' : undefined}
      className={cn(
        'grid gap-1 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        selected && 'bg-accent',
      )}
    >
      <span className="flex items-center gap-2">
        <span className="font-medium">v{version.versionNo}</span>
        {current ? <Badge variant="secondary">Latest</Badge> : null}
        <time
          dateTime={version.createdAt}
          title={new Date(version.createdAt).toLocaleString()}
          className="ml-auto text-xs text-muted-foreground"
        >
          {formatRelativeTime(version.createdAt)}
        </time>
      </span>
      {version.changeNote ? (
        <span className="break-words whitespace-pre-line">{version.changeNote}</span>
      ) : null}
      <span className="text-xs text-muted-foreground">
        {typeLabel(version.mimeType)}, {formatBytes(version.sizeBytes)}
      </span>
    </Link>
  );
}
