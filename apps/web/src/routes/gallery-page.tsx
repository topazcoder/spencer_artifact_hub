import {
  ARTIFACT_LIST_DEFAULT_PAGE_SIZE,
  ARTIFACT_LIST_SCOPES,
  type ArtifactListScope,
  artifactListQuerySchema,
} from '@artifact-hub/shared';
import { Loader2Icon, PlusIcon } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { Pagination } from '@/components/pagination.tsx';
import { Button } from '@/components/ui/button.tsx';
import { ArtifactCard } from '@/features/artifacts/artifact-card.tsx';
import type { GalleryFilters as Filters } from '@/features/artifacts/artifacts.types.ts';
import { GalleryFilters, hasFilters } from '@/features/artifacts/gallery-filters.tsx';
import { PublishDialog } from '@/features/artifacts/publish-dialog.tsx';
import { useArtifactList } from '@/features/artifacts/use-artifacts.ts';
import { InlineError, InlineLoading } from '@/components/inline-status.tsx';
import { cn } from '@/lib/utils';

const HEADINGS: Record<ArtifactListScope, string> = {
  mine: 'My artifacts',
  shared: 'Shared with me',
  public: 'Shared with the company',
};

/** The gallery's URL state; anything invalid falls back to its default. */
function useGalleryParams(): Filters & { page: number } {
  const [searchParams] = useSearchParams();
  const parse = <T,>(schema: z.ZodType<T>, key: string): T | undefined => {
    const parsed = schema.safeParse(searchParams.get(key) ?? undefined);
    return parsed.success ? parsed.data : undefined;
  };
  // A key that may repeat (`?tag=a&tag=b`).
  const parseAll = <T,>(schema: z.ZodType<T>, key: string): T | undefined => {
    const parsed = schema.safeParse(searchParams.getAll(key));
    return parsed.success ? parsed.data : undefined;
  };
  const { shape } = artifactListQuerySchema;
  const scopeParam = searchParams.get('scope');
  const scope = ARTIFACT_LIST_SCOPES.find((s) => s === scopeParam) ?? 'mine';
  const page = Number(searchParams.get('page'));
  return {
    scope,
    q: parse(shape.q, 'q'),
    type: parse(shape.type, 'type'),
    tag: parseAll(shape.tag, 'tag'),
    owner: parseAll(shape.owner, 'owner'),
    ownerId: parseAll(shape.ownerId, 'ownerId'),
    updatedFrom: parse(shape.updatedFrom, 'updatedFrom'),
    updatedTo: parse(shape.updatedTo, 'updatedTo'),
    sort: parse(shape.sort, 'sort'),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** The gallery URL for these filters and page, leaving defaults out. */
function galleryHref(
  { scope, q, type, tag, owner, ownerId, updatedFrom, updatedTo, sort }: Filters,
  page = 1,
): string {
  const query = new URLSearchParams();
  if (scope !== 'mine') query.set('scope', scope);
  for (const [key, value] of Object.entries({
    q,
    type,
    tag,
    owner,
    ownerId,
    updatedFrom,
    updatedTo,
    sort,
  })) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item) query.append(key, item);
    }
  }
  if (page > 1) query.set('page', String(page));
  const search = query.toString();
  return search ? `/?${search}` : '/';
}

/**
 * Home: my artifacts, those shared with me, or those shared with the whole company; searched
 * and filtered.
 */
export function GalleryPage() {
  const { page, ...filters } = useGalleryParams();
  const { scope } = filters;
  const navigate = useNavigate();
  const pageSize = ARTIFACT_LIST_DEFAULT_PAGE_SIZE;
  const { data, error, refetch, isPlaceholderData } = useArtifactList({
    ...filters,
    page,
    pageSize,
  });
  const filtered = hasFilters(filters);
  // New filters start from the first page, without piling up history while typing.
  const applyFilters = (next: Filters) => void navigate(galleryHref(next), { replace: true });

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{HEADINGS[scope]}</h1>
        {isPlaceholderData ? (
          <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            {filtered ? 'Searching…' : 'Loading…'}
          </p>
        ) : data && data.total > 0 ? (
          <p className="text-sm text-muted-foreground">
            {data.total} {data.total === 1 ? 'artifact' : 'artifacts'}
          </p>
        ) : null}
      </div>

      <GalleryFilters filters={filters} loading={isPlaceholderData} onChange={applyFilters} />

      {/* A minimum height, so the page doesn't shrink when nothing is found. */}
      <div className="grid min-h-[28rem] content-start gap-6">
        {error ? (
          <div className="h-64">
            <InlineError error={error} onRetry={() => void refetch()} />
          </div>
        ) : !data ? (
          <div className="h-64">
            <InlineLoading />
          </div>
        ) : data.total === 0 && filtered ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
            <h2 className="text-lg font-medium">No artifacts match</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Try other words, or fewer filters.
            </p>
            <Button variant="outline" onClick={() => applyFilters({ scope, sort: filters.sort })}>
              Clear filters
            </Button>
          </div>
        ) : data.total === 0 ? (
          <EmptyGallery scope={scope} />
        ) : data.items.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">
            There's nothing on this page.{' '}
            <Link to={galleryHref(filters)} className="underline">
              Go to the first page
            </Link>
          </p>
        ) : (
          <>
            <ul
              className={cn(
                'grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
                // Earlier results stay while new ones load, faded.
                isPlaceholderData && 'opacity-50',
              )}
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
              hrefFor={(n) => galleryHref(filters, n)}
            />
          </>
        )}
      </div>
    </section>
  );
}

const EMPTY_SHARED: Record<Exclude<ArtifactListScope, 'mine'>, { title: string; text: string }> = {
  shared: {
    title: 'Nothing shared with you yet',
    text: 'Artifacts colleagues share with you by name show up here.',
  },
  public: {
    title: 'Nothing shared with the company yet',
    text: 'Artifacts shared with everyone at the company show up here, for all to view and comment on.',
  },
};

function EmptyGallery({ scope }: { scope: ArtifactListScope }) {
  if (scope !== 'mine') {
    const { title, text } = EMPTY_SHARED[scope];
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center">
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
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
