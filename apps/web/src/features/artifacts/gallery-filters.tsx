import { ARTIFACT_TYPE_FILTERS, type ArtifactTypeFilter } from '@artifact-hub/shared';
import { Loader2Icon, SearchIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { NativeSelect } from '@/components/ui/native-select.tsx';
import { TYPE_FILTER_LABELS } from './artifact-types.ts';
import type { GalleryFilters as Filters } from './artifacts.types.ts';
import { useArtifactTags } from './use-artifacts.ts';

const TYPE_FILTERS = Object.keys(ARTIFACT_TYPE_FILTERS) as ArtifactTypeFilter[];
const SEARCH_DELAY_MS = 300;

/**
 * Search box, type and tag filters for a gallery scope. A search applies once typing pauses,
 * the other filters at once; every change goes through `onChange` (which puts it in the URL).
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
  const { data: tags } = useArtifactTags(filters.scope);

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

  const active = Boolean(filters.q || filters.type || filters.tag);
  const tagOptions = tags?.map((item) => item.tag) ?? [];
  // A tag from the URL stays selectable even if it isn't among the most used.
  if (filters.tag && !tagOptions.includes(filters.tag)) tagOptions.unshift(filters.tag);

  return (
    <div role="search" className="flex flex-wrap items-center gap-2">
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
        />
      </div>
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
      <NativeSelect
        aria-label="Tag"
        value={filters.tag ?? ''}
        onChange={(event) => apply({ tag: event.target.value || undefined })}
      >
        <option value="">All tags</option>
        {tagOptions.map((tag) => (
          <option key={tag} value={tag}>
            {tag}
          </option>
        ))}
      </NativeSelect>
      {active ? (
        <Button
          variant="ghost"
          onClick={() => {
            clearTimeout(timer.current);
            setPending(false);
            setText('');
            onChange({ scope: filters.scope });
          }}
        >
          <XIcon aria-hidden="true" />
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
