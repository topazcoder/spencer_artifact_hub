import { ARTIFACT_LIST_DEFAULT_PAGE_SIZE } from '@artifact-hub/shared';
import { PlusIcon } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Pagination } from '@/components/pagination.tsx';
import { Button } from '@/components/ui/button.tsx';
import { ArtifactCard } from '@/features/artifacts/artifact-card.tsx';
import { PublishDialog } from '@/features/artifacts/publish-dialog.tsx';
import { useArtifactList } from '@/features/artifacts/use-artifacts.ts';
import { InlineError, InlineLoading } from '@/components/inline-status.tsx';

/** The current `?page=`, falling back to 1 for anything that isn't a positive integer. */
function usePageParam(): number {
  const [searchParams] = useSearchParams();
  const page = Number(searchParams.get('page'));
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/** Home: the artifacts I published. All public and Shared with me join it in steps 12–14. */
export function GalleryPage() {
  const page = usePageParam();
  const pageSize = ARTIFACT_LIST_DEFAULT_PAGE_SIZE;
  const { data, error, refetch, isPlaceholderData } = useArtifactList({
    scope: 'mine',
    page,
    pageSize,
  });

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">My artifacts</h1>
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
        <EmptyGallery />
      ) : data.items.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          There's nothing on this page.{' '}
          <Link to="/" className="underline">
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
            hrefFor={(n) => (n === 1 ? '/' : `/?page=${n}`)}
          />
        </>
      )}
    </section>
  );
}

function EmptyGallery() {
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
