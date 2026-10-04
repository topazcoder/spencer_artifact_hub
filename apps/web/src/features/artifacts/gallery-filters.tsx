import {
  ARTIFACT_LIST_SCOPES,
  ARTIFACT_TYPE_FILTERS,
  type ArtifactListSort,
  type ArtifactTypeFilter,
} from '@artifact-hub/shared';
import { Loader2Icon, SearchIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.tsx';
import { Input } from '@/components/ui/input.tsx';
import { NativeSelect } from '@/components/ui/native-select.tsx';
import { useAppConfig } from '@/features/config/use-app-config.ts';
import { formatUpdatedRange } from '@/lib/format.ts';
import { useMediaQuery } from '@/lib/use-media-query.ts';
import { SCOPE_LABELS, TYPE_FILTER_LABELS } from './artifact-types.ts';
import type { GalleryFilters as Filters } from './artifacts.types.ts';
import { useUsers } from '@/features/sharing/use-sharing.ts';
import { AiSearchDialog } from './ai-search-dialog.tsx';
import { OwnerPicker, type PickedOwner } from './owner-picker.tsx';
import { TagPicker } from './tag-picker.tsx';

const TYPE_FILTERS = Object.keys(ARTIFACT_TYPE_FILTERS) as ArtifactTypeFilter[];
const SEARCH_DELAY_MS = 300;
const SORT_LABELS: Record<ArtifactListSort | 'relevance', string> = {
  relevance: 'Best match',
  newest: 'Newest first',
  oldest: 'Oldest first',
  updated_desc: 'Recently updated',
  updated_asc: 'Least recently updated',
};

/** Below this width the filters are in a dialog, opened by an icon. Tailwind's `sm`. */
const WIDE_SCREEN = '(min-width: 640px)';

/** Whether `filters` narrow their scope at all. */
export function hasFilters({
  q,
  type,
  tag,
  owner,
  ownerId,
  updatedFrom,
  updatedTo,
}: Filters): boolean {
  return Boolean(
    q || type || tag?.length || owner?.length || ownerId?.length || updatedFrom || updatedTo,
  );
}

/** `items` without `item`; undefined when nothing is left, which is how a filter is cleared. */
function without(items: readonly string[] | undefined, item: string): string[] | undefined {
  const rest = (items ?? []).filter((other) => other !== item);
  return rest.length > 0 ? rest : undefined;
}

/**
 * Search box on top, below it the scope (which artifacts to show), type, tags (several, searched on the server) and owner filters (the owner is picked from the users matching what is typed) and the sort order. A search applies once typing pauses,
 * the other filters at once (Enter applies a search at once too); every change goes through
 * `onChange` (which puts it in the URL). With AI, *AI search* replaces the filters with what a
 * description asks for; owner and dates show as removable chips.
 */
export function GalleryFilters({
  filters,
  loading,
  onChange,
}: {
  filters: Filters;
  /** Results for the current filters are on their way. */
  loading: boolean;
  onChange: (filters: Filters) => void;
}) {
  const [text, setText] = useState(filters.q ?? '');
  /** A search typed but not applied yet. */
  const [pending, setPending] = useState(false);
  const [shownQ, setShownQ] = useState(filters.q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const owners = useUsers(filters.ownerId ?? []);
  const { data: config } = useAppConfig();
  const smart = config?.features.ai ?? false;

  // The URL's search changed elsewhere (Clear filters, the back button): show it.
  if (filters.q !== shownQ) {
    setShownQ(filters.q);
    if (text.trim() !== (filters.q ?? '')) setText(filters.q ?? '');
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  /** Applies `changes` with whatever is typed, cancelling a search still waiting to apply. */
  const apply = (changes: Partial<Filters>, typed = text) => {
    clearTimeout(timer.current);
    setPending(false);
    onChange({ ...filters, q: typed.trim() || undefined, ...changes });
  };

  const onType = (value: string) => {
    setText(value);
    setPending(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => apply({}, value), SEARCH_DELAY_MS);
  };

  /** Filters from an AI search, replacing the current ones. */
  const applySearch = (found: Filters) => {
    clearTimeout(timer.current);
    setPending(false);
    setText(found.q ?? '');
    onChange(found);
  };

  const active = hasFilters(filters);
  const updated = formatUpdatedRange(filters.updatedFrom, filters.updatedTo);
  /** Owners picked by hand (by id) and the ones an AI search matched by name or email. */
  const pickedOwners: PickedOwner[] = [
    ...(filters.ownerId ?? []).map((id, index) => ({
      key: id,
      label: owners[index]?.data?.displayName ?? 'this owner',
      remove: () => apply({ ownerId: without(filters.ownerId, id) }),
    })),
    ...(filters.owner ?? []).map((name) => ({
      key: `name:${name}`,
      label: name,
      remove: () => apply({ owner: without(filters.owner, name) }),
    })),
  ];
  const chips = [
    updated ? { label: updated, clear: { updatedFrom: undefined, updatedTo: undefined } } : null,
  ].filter((chip) => chip !== null);
  const controls = (
    <>
      <NativeSelect
        aria-label="Show"
        value={filters.scope}
        // The tags belong to the scope, and in your own artifacts you are the only owner.
        onChange={(event) => {
          const scope = event.target.value as Filters['scope'];
          apply({
            scope,
            tag: undefined,
            ...(scope === 'mine' ? { owner: undefined, ownerId: undefined } : {}),
          });
        }}
      >
        {ARTIFACT_LIST_SCOPES.map((scope) => (
          <option key={scope} value={scope}>
            {SCOPE_LABELS[scope]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Type"
        value={filters.type ?? ''}
        onChange={(event) => apply({ type: (event.target.value || undefined) as Filters['type'] })}
      >
        <option value="">All types</option>
        {TYPE_FILTERS.map((type) => (
          <option key={type} value={type}>
            {TYPE_FILTER_LABELS[type]}
          </option>
        ))}
      </NativeSelect>
      <TagPicker
        key={`tags-${filters.scope}`}
        scope={filters.scope}
        selected={filters.tag ?? []}
        onChange={(tag) => apply({ tag: tag.length > 0 ? tag : undefined })}
      />
      {filters.scope === 'mine' && pickedOwners.length === 0 ? null : (
        <OwnerPicker
          key={`owner-${filters.scope}`}
          selected={pickedOwners}
          onPick={(user) => {
            if (!filters.ownerId?.includes(user.id)) {
              apply({ ownerId: [...(filters.ownerId ?? []), user.id] });
            }
          }}
        />
      )}
      <NativeSelect
        aria-label="Sort by"
        value={filters.sort ?? ''}
        onChange={(event) => apply({ sort: (event.target.value || undefined) as Filters['sort'] })}
      >
        <option value="">{filters.q ? SORT_LABELS.relevance : SORT_LABELS.updated_desc}</option>
        <option value="newest">{SORT_LABELS.newest}</option>
        <option value="oldest">{SORT_LABELS.oldest}</option>
        {/* Without a search, recently updated is the default above. */}
        {filters.q ? <option value="updated_desc">{SORT_LABELS.updated_desc}</option> : null}
        <option value="updated_asc">{SORT_LABELS.updated_asc}</option>
      </NativeSelect>
      {chips.map(({ label, clear }) => (
        <Button
          key={label}
          variant="secondary"
          className="justify-self-start"
          size="sm"
          aria-label={`Remove filter: ${label}`}
          onClick={() => apply(clear)}
        >
          {label}
          <XIcon aria-hidden="true" />
        </Button>
      ))}
      {active ? (
        <Button
          variant="ghost"
          className="justify-self-start"
          onClick={() => {
            clearTimeout(timer.current);
            setPending(false);
            setText('');
            onChange({ scope: filters.scope, sort: filters.sort });
          }}
        >
          <XIcon aria-hidden="true" />
          Clear filters
        </Button>
      ) : null}
    </>
  );
  const wide = useMediaQuery(WIDE_SCREEN, true);

  return (
    <div role="search" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          {pending || loading ? (
            <Loader2Icon
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <Input
            type="search"
            aria-label="Search"
            placeholder="Search titles, tags and descriptions"
            className="pl-8"
            value={text}
            onChange={(event) => onType(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
              event.preventDefault();
              apply({});
            }}
          />
        </div>
        {smart ? <AiSearchDialog scope={filters.scope} onSearch={applySearch} /> : null}
        {wide ? null : (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Filters">
                <SlidersHorizontalIcon aria-hidden="true" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Filters</DialogTitle>
                <DialogDescription className="sr-only">
                  Choose what the gallery shows. Changes apply at once.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">{controls}</div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button>Done</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      {wide ? <div className="flex flex-wrap items-center gap-2">{controls}</div> : null}
    </div>
  );
}
