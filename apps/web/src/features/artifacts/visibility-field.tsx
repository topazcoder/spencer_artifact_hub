import type { ArtifactVisibility } from '@artifact-hub/shared';
import { GlobeIcon, LockIcon } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';

const OPTIONS: { value: ArtifactVisibility; label: string; hint: string; Icon: typeof LockIcon }[] =
  [
    {
      value: 'private',
      label: 'Private',
      hint: 'Only you, and people you share it with',
      Icon: LockIcon,
    },
    {
      value: 'public',
      label: 'Public',
      hint: 'Everyone signed in can find, view and comment on it',
      Icon: GlobeIcon,
    },
  ];

/** Private or public, as two radio cards. Pass `register('visibility')`. */
export function VisibilityField(props: UseFormRegisterReturn & { disabled?: boolean }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm leading-none font-medium">Visibility</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map(({ value, label, hint, Icon }) => (
          <label
            key={value}
            className="flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-accent/50 has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
          >
            <input type="radio" value={value} className="sr-only" {...props} />
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="grid gap-1">
              <span className="font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
