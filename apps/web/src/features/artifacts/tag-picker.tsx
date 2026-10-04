import type { ArtifactListScope } from '@artifact-hub/shared';
import { XIcon } from 'lucide-react';
import { type ChangeEvent, type KeyboardEvent, useId, useState } from 'react';
import { Badge } from '@/components/ui/badge.tsx';
import { Input } from '@/components/ui/input.tsx';
import { useArtifactTags } from './use-artifacts.ts';

/**
 * Finds tags to filter by. The picked tags show inside the field, each removable; typing
 * searches the scope's tags on the server and suggests a few, the most used first. Picking a
 * suggestion (it fills in its tag), or pressing Enter on a tag's full name, adds it and clears the
 * text, so several can be picked in turn.
 */
export function TagPicker({
  scope,
  selected,
  onChange,
}: {
  scope: ArtifactListScope;
  selected: readonly string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const { data: tags } = useArtifactTags(scope, draft);
  const listId = useId();
  // The ones picked already aren't suggested again.
  const suggestions = tags?.filter((item) => !selected.includes(item.tag)) ?? [];

  /** Adds the suggestion that is exactly `text`, if there is one. */
  const pick = (text: string): boolean => {
    const picked = suggestions.find((item) => item.tag === text.trim().toLowerCase());
    if (!picked) return false;
    setDraft('');
    onChange([...selected, picked.tag]);
    return true;
  };

  const onType = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    // Choosing from the list replaces the text; typing a tag's name might be the start of a
    // longer one ("topic-1", "topic-12"), so it waits for Enter.
    const typed =
      event.nativeEvent instanceof InputEvent &&
      event.nativeEvent.inputType !== 'insertReplacementText';
    if (typed || !pick(value)) setDraft(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing && draft.trim()) {
      event.preventDefault();
      pick(draft);
    } else if (event.key === 'Backspace' && !draft && selected.length > 0) {
      onChange(selected.slice(0, -1));
    }
  };

  return (
    <div className="flex min-h-9 min-w-48 flex-1 flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1 shadow-xs has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50 sm:max-w-md dark:bg-input/30">
      {selected.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1">
          {tag}
          <button
            type="button"
            className="rounded-sm opacity-70 hover:opacity-100"
            aria-label={`Remove tag ${tag}`}
            onClick={() => onChange(selected.filter((t) => t !== tag))}
          >
            <XIcon />
          </button>
        </Badge>
      ))}
      <Input
        type="text"
        aria-label="Filter by tags"
        placeholder={selected.length > 0 ? '' : 'Filter by tag'}
        autoComplete="off"
        list={listId}
        value={draft}
        className="h-7 min-w-24 flex-1 border-0 px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
        onChange={onType}
        onKeyDown={onKeyDown}
      />
      <datalist id={listId}>
        {suggestions.map((item) => (
          // `label`, not text: the count is a hint, not page content.
          <option
            key={item.tag}
            value={item.tag}
            label={`${item.count} ${item.count === 1 ? 'artifact' : 'artifacts'}`}
          />
        ))}
      </datalist>
    </div>
  );
}
