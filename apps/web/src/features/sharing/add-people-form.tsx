import {
  type SharePermission,
  unknownRecipientsDetailsSchema,
  USER_SEARCH_MIN_LENGTH,
} from '@artifact-hub/shared';
import { XIcon } from 'lucide-react';
import { type ClipboardEvent, type FormEvent, type KeyboardEvent, useId, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormError } from '@/components/form-fields.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { describeError, isApiError } from '@/lib/api/api-error.ts';
import { cn } from '@/lib/utils';
import { PermissionSelect, VersionSelect } from './access-selects.tsx';
import { useSharePeople, useUserSearch } from './use-sharing.ts';

const emailSchema = z.email();
/** Typing one of these ends an email. */
const SEPARATORS = new Set(['Enter', ',', ';', ' ']);

/**
 * Adds people by email, each becoming a chip; suggests existing users as you type. Everyone
 * added gets the same permission and version.
 */
export function AddPeopleForm({ artifactId }: { artifactId: string }) {
  const share = useSharePeople(artifactId);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [permission, setPermission] = useState<SharePermission>('view');
  const [versionNo, setVersionNo] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const [unknownEmails, setUnknownEmails] = useState<string[]>([]);
  const { data: suggestions } = useUserSearch(draft);
  const listId = useId();

  /** Adds typed text as chips; returns the full list, or null if something isn't an email. */
  const commit = (text: string): string[] | null => {
    const typed = text
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    const invalid = typed.find((email) => !emailSchema.safeParse(email).success);
    if (invalid) {
      setError(`“${invalid}” isn't an email address.`);
      return null;
    }
    const next = [...new Set([...emails, ...typed])];
    setEmails(next);
    setDraft('');
    setError(undefined);
    return next;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (SEPARATORS.has(event.key) && draft.trim()) {
      event.preventDefault();
      commit(draft);
    } else if (event.key === 'Backspace' && !draft && emails.length > 0) {
      setEmails(emails.slice(0, -1));
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    if (!/[\s,;]/.test(text.trim())) return;
    event.preventDefault();
    commit(`${draft} ${text}`);
  };

  const onChange = (value: string) => {
    setDraft(value);
    // Picking a suggestion fills in its email: add it right away.
    if (suggestions?.some((user) => user.email === value)) commit(value);
  };

  const remove = (email: string) => {
    setEmails(emails.filter((e) => e !== email));
    setUnknownEmails(unknownEmails.filter((e) => e !== email));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const all = draft.trim() ? commit(draft) : emails;
    if (!all) return;
    if (all.length === 0) {
      setError('Add at least one email.');
      return;
    }
    try {
      await share.mutateAsync({ emails: all, permission, versionNo });
      toast.success(all.length === 1 ? 'Shared with 1 person' : `Shared with ${all.length} people`);
      setEmails([]);
      setUnknownEmails([]);
      setError(undefined);
    } catch (shareError) {
      if (isApiError(shareError, 'SHARE_RECIPIENT_UNKNOWN')) {
        const details = unknownRecipientsDetailsSchema.safeParse(shareError.details);
        setUnknownEmails(details.success ? details.data.unknownEmails : []);
      }
      setError(describeError(shareError));
    }
  };

  const showSuggestions = draft.trim().length >= USER_SEARCH_MIN_LENGTH;

  return (
    <form noValidate className="grid gap-3" onSubmit={(event) => void submit(event)}>
      <FormError message={error} />
      <div
        className={cn(
          'flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1.5 shadow-xs has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50 dark:bg-input/30',
          error && 'border-destructive',
        )}
      >
        {emails.map((email) => (
          <Badge
            key={email}
            variant={unknownEmails.includes(email) ? 'destructive' : 'secondary'}
            className="gap-1 pr-1"
          >
            {email}
            <button
              type="button"
              className="rounded-sm opacity-70 hover:opacity-100"
              aria-label={`Remove ${email}`}
              onClick={() => remove(email)}
            >
              <XIcon />
            </button>
          </Badge>
        ))}
        <Input
          type="email"
          value={draft}
          list={showSuggestions ? listId : undefined}
          autoComplete="off"
          placeholder={emails.length ? '' : 'Add people by email'}
          aria-label="Emails"
          aria-invalid={error ? true : undefined}
          className="h-7 min-w-40 flex-1 border-0 px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
          disabled={share.isPending}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
        />
        <datalist id={listId}>
          {suggestions?.map((user) => (
            <option key={user.id} value={user.email}>
              {user.displayName}
            </option>
          ))}
        </datalist>
      </div>
      <div className="flex flex-wrap gap-2">
        <PermissionSelect
          aria-label="Permission for new people"
          value={permission}
          onChange={setPermission}
          disabled={share.isPending}
        />
        <VersionSelect
          aria-label="Version for new people"
          artifactId={artifactId}
          value={versionNo}
          onChange={setVersionNo}
          disabled={share.isPending}
        />
        <Button type="submit" className="ml-auto" disabled={share.isPending}>
          {share.isPending ? 'Sharing…' : 'Share'}
        </Button>
      </div>
    </form>
  );
}
