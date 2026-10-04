import { type UserSummary, USER_SEARCH_MIN_LENGTH } from '@artifact-hub/shared';
import { useId, useState } from 'react';
import { Input } from '@/components/ui/input.tsx';
import { useUserSearch } from '@/features/sharing/use-sharing.ts';

/**
 * Finds the user who owns the artifacts to show: suggests users as you type (by name or email),
 * and picking one hands over the user. Like the people picker of the share dialog, a suggestion
 * fills in its email.
 */
export function OwnerPicker({ onPick }: { onPick: (user: UserSummary) => void }) {
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

  return (
    <>
      <Input
        type="text"
        aria-label="Owner"
        placeholder="Owner name or email"
        className="w-full sm:w-52"
        autoComplete="off"
        value={draft}
        list={draft.trim().length >= USER_SEARCH_MIN_LENGTH ? listId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {suggestions?.map((user) => (
          <option key={user.id} value={user.email}>
            {user.displayName}
          </option>
        ))}
      </datalist>
    </>
  );
}
