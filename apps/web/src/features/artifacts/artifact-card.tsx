import type { Artifact, ArtifactMimeType } from '@artifact-hub/shared';
import { FileCodeIcon, FileIcon, FileTextIcon, LockIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge.tsx';
import { formatRelativeTime } from '@/lib/format.ts';
import { artifactContentUrl } from './artifacts-api.ts';
import { typeLabel, viewerKind } from './artifact-types.ts';

const MAX_TAGS = 3;

/** A gallery card linking to the artifact page. */
export function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const version = artifact.currentVersion;
  const extraTags = artifact.tags.length - MAX_TAGS;

  return (
    <Link
      to={`/artifacts/${artifact.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden border-b bg-muted">
        {version ? (
          <Thumbnail
            artifactId={artifact.id}
            versionNo={version.versionNo}
            mimeType={version.mimeType}
          />
        ) : (
          <FileIcon className="size-10 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <div className="grid gap-2 p-4">
        <h2 className="line-clamp-2 font-medium break-words group-hover:underline">
          {artifact.title}
        </h2>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {version ? <Badge variant="secondary">{typeLabel(version.mimeType)}</Badge> : null}
          {artifact.visibility === 'private' ? (
            <LockIcon className="size-3.5" aria-label="Private" />
          ) : null}
          <span>
            {artifact.owner.displayName} · {formatRelativeTime(artifact.updatedAt)}
          </span>
        </div>
        {artifact.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1" aria-label="Tags">
            {artifact.tags.slice(0, MAX_TAGS).map((tag) => (
              <li key={tag}>
                <Badge variant="outline">{tag}</Badge>
              </li>
            ))}
            {extraTags > 0 ? <li className="text-xs text-muted-foreground">+{extraTags}</li> : null}
          </ul>
        ) : null}
      </div>
    </Link>
  );
}

/**
 * Images (and SVG, safely, as `<img>`) show themselves; other types show an icon until
 * rendered thumbnails arrive (plan step 28).
 */
function Thumbnail({
  artifactId,
  versionNo,
  mimeType,
}: {
  artifactId: string;
  versionNo: number;
  mimeType: ArtifactMimeType;
}) {
  if (viewerKind(mimeType) === 'image') {
    return (
      <img
        src={artifactContentUrl(artifactId, versionNo)}
        alt=""
        loading="lazy"
        className="size-full object-contain p-2"
      />
    );
  }
  const Icon = mimeType === 'text/html' ? FileCodeIcon : FileTextIcon;
  return (
    <span className="flex flex-col items-center gap-1 text-muted-foreground">
      <Icon className="size-10" aria-hidden="true" />
      <span className="text-xs font-medium">{typeLabel(mimeType)}</span>
    </span>
  );
}
