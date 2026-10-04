import { type UserSummary, USER_SEARCH_MIN_LENGTH } from '@artifact-hub/shared';
import { XIcon } from 'lucide-react';
import { type KeyboardEvent, useId, useState } from 'react';
import { Badge } from '@/components/ui/badge.tsx';
import { Input } from '@/components/ui/input.tsx';
import { useUserSearch } from '@/features/sharing/use-sharing.ts';

/** An owner the gallery is filtered by, shown inside the picker. */
export interface PickedOwner {
  key: string;
  /** The owner's name, or whatever an AI search matched on. */
  label: string;
  remove: () => void;
}

/**
 * Finds the users who own the artifacts to show. The ones picked already show inside the field,
 * each removable (Backspace removes the last); typing suggests users by name or email, and
 * picking one hands over the user and clears the text, so several can be picked in turn. Like
 * the people picker of the share dialog, a suggestion fills in its email.
 */
export function OwnerPicker({
  selected,
  onPick,
}: {
  selected: readonly PickedOwner[];
  onPick: (user: UserSummary) => void;
}) {
  const [draft, setDraft] = useState('');
  const { data: suggestions } = useUserSearch(draft);
  const listId = useId();

  const onChange = (value: string) => {
    const picked = suggestions?.find(
      (user) => user.email.toLowerCase() === value.trim().toLowerCase(),
    );
    if (picked) {
      setDraft('');
      onPick(picked);
    } else {
      setDraft(value);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !draft && selected.length > 0) selected.at(-1)?.remove();
  };

  return (
    <div className="flex h-9 w-full max-w-full items-center overflow-x-auto overflow-y-hidden gap-1.5 rounded-md border border-input px-2 py-0 shadow-xs has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50 sm:w-auto sm:min-w-64 dark:bg-input/30">
      {selected.map(({ key, label, remove }) => (
        <Badge key={key} variant="secondary" className="shrink-0 gap-1 pr-1">
          {label}
          <button
            type="button"
            className="rounded-sm opacity-70 hover:opacity-100"
            aria-label={`Remove owner ${label}`}
            onClick={remove}
          >
            <XIcon />
          </button>
        </Badge>
      ))}
      <Input
        type="text"
        aria-label="Owner"
        placeholder={selected.length > 0 ? '' : 'Owner name or email'}
        className="h-7 min-w-24 flex-1 shrink-0 border-0 px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
        autoComplete="off"
        value={draft}
        list={draft.trim().length >= USER_SEARCH_MIN_LENGTH ? listId : undefined}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <datalist id={listId}>
        {suggestions
          ?.filter((user) => !selected.some(({ key }) => key === user.id))
          .map((user) => (
            <option key={user.id} value={user.email}>
              {user.displayName}
            </option>
          ))}
      </datalist>
    </div>
  );
}
