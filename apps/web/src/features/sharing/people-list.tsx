import type { SharedPerson } from '@artifact-hub/shared';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { toastError } from '@/lib/toast-error.ts';
import { PermissionSelect, VersionSelect } from './access-selects.tsx';
import { useRemovePerson, useUpdatePerson } from './use-sharing.ts';

/** Everyone the artifact is shared with; changes are saved as they are made. */
export function PeopleList({ artifactId, people }: { artifactId: string; people: SharedPerson[] }) {
  const update = useUpdatePerson(artifactId);
  const remove = useRemovePerson(artifactId);

  if (people.length === 0) {
    return <p className="text-sm text-muted-foreground">Not shared with anyone yet.</p>;
  }

  return (
    <ul className="grid gap-1" aria-label="People with access">
      {people.map((person) => {
        const { user } = person;
        const busy =
          (update.isPending && update.variables.userId === user.id) ||
          (remove.isPending && remove.variables === user.id);
        return (
          <li key={user.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
            <span className="grid min-w-0 flex-1 basis-40">
              <span className="truncate font-medium">{user.displayName}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
            <PermissionSelect
              aria-label={`Permission for ${user.displayName}`}
              value={person.permission}
              disabled={busy}
              onChange={(permission) =>
                update.mutate({ userId: user.id, permission }, { onError: toastError })
              }
            />
            <VersionSelect
              aria-label={`Version for ${user.displayName}`}
              artifactId={artifactId}
              value={person.pinnedVersionNo}
              disabled={busy}
              onChange={(versionNo) =>
                update.mutate({ userId: user.id, versionNo }, { onError: toastError })
              }
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${user.displayName}`}
              disabled={busy}
              onClick={() => remove.mutate(user.id, { onError: toastError })}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
