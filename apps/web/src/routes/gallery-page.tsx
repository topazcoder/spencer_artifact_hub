import {
  ARTIFACT_LIST_DEFAULT_PAGE_SIZE,
  ARTIFACT_LIST_SCOPES,
  type ArtifactListScope,
} from '@artifact-hub/shared';
import { PlusIcon } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Pagination } from '@/components/pagination.tsx';
import { Button } from '@/components/ui/button.tsx';
import { ArtifactCard } from '@/features/artifacts/artifact-card.tsx';
import { PublishDialog } from '@/features/artifacts/publish-dialog.tsx';
import { useArtifactList } from '@/features/artifacts/use-artifacts.ts';
import { InlineError, InlineLoading } from '@/components/inline-status.tsx';
import { cn } from '@/lib/utils';

const SCOPES: Record<ArtifactListScope, { tab: string; heading: string }> = {
  mine: { tab: 'Mine', heading: 'My artifacts' },
  public: { tab: 'All public', heading: 'Public artifacts' },
};

/** `?scope=` (default `mine`) and `?page=` (default 1); anything invalid falls back. */
function useGalleryParams(): { scope: ArtifactListScope; page: number } {
  const [searchParams] = useSearchParams();
  const scopeParam = searchParams.get('scope');
  const scope = ARTIFACT_LIST_SCOPES.find((s) => s === scopeParam) ?? 'mine';
  const page = Number(searchParams.get('page'));
  return { scope, page: Number.isInteger(page) && page >= 1 ? page : 1 };
}

/** The gallery URL for a scope and page, leaving defaults out. */
function galleryHref(scope: ArtifactListScope, page = 1): string {
  const query = new URLSearchParams();
  if (scope !== 'mine') query.set('scope', scope);
  if (page > 1) query.set('page', String(page));
  const search = query.toString();
  return search ? `/?${search}` : '/';
}

/** Home: my artifacts, or every public one. Shared with me joins them in step 14. */
export function GalleryPage() {
  const { scope, page } = useGalleryParams();
  const pageSize = ARTIFACT_LIST_DEFAULT_PAGE_SIZE;
  const { data, error, refetch, isPlaceholderData } = useArtifactList({ scope, page, pageSize });

  return (
    <section className="grid gap-6">
      <nav aria-label="Gallery" className="flex gap-1 border-b">
        {ARTIFACT_LIST_SCOPES.map((s) => (
          <Link
            key={s}
            to={galleryHref(s)}
            aria-current={s === scope ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
              s === scope
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {SCOPES[s].tab}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{SCOPES[scope].heading}</h1>
        {data && data.total > 0 ? (
          <p className="text-sm text-muted-foreground">
            {data.total} {data.total === 1 ? 'artifact' : 'artifacts'}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="h-64">
          <InlineError error={error} onRetry={() => void refetch()} />
        </div>
      ) : !data ? (
        <div className="h-64">
          <InlineLoading />
        </div>
      ) : data.total === 0 ? (
        <EmptyGallery scope={scope} />
      ) : data.items.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          There's nothing on this page.{' '}
          <Link to={galleryHref(scope)} className="underline">
            Go to the first page
          </Link>
        </p>
      ) : (
        <>
          <ul
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            aria-busy={isPlaceholderData}
          >
            {data.items.map((artifact) => (
              <li key={artifact.id} className="grid">
                <ArtifactCard artifact={artifact} />
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            pageCount={Math.ceil(data.total / pageSize)}
            hrefFor={(n) => galleryHref(scope, n)}
          />
        </>
      )}
    </section>
  );
}

function EmptyGallery({ scope }: { scope: ArtifactListScope }) {
  if (scope === 'public') {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center">
        <h2 className="text-lg font-medium">No public artifacts yet</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Artifacts anyone makes public show up here, for everyone to view and comment on.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16 text-center">
      <h2 className="text-lg font-medium">Nothing published yet</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Publish HTML, SVG, Markdown, an image or a PDF to view it here, keep versions and share it.
      </p>
      <PublishDialog>
        <Button>
          <PlusIcon aria-hidden="true" />
          Publish your first artifact
        </Button>
      </PublishDialog>
    </div>
  );
}
