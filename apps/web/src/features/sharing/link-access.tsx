import type { ShareLink } from '@artifact-hub/shared';
import { CopyIcon, GlobeIcon, RefreshCwIcon } from 'lucide-react';
import { useId } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { NativeSelect } from '@/components/ui/native-select.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { copyWithToast } from '@/lib/clipboard.ts';
import { toastError } from '@/lib/toast-error.ts';
import { VersionSelect } from './access-selects.tsx';
import { isLinkActive } from './access-summary.ts';
import {
  DEFAULT_EXPIRY,
  EXPIRY_PRESETS,
  type ExpiryPreset,
  expiresAtFor,
  expiryLabel,
} from './link-expiry.ts';
import { useResetShareLink, useSetShareLink, useTurnOffShareLink } from './use-sharing.ts';

/** The current expiry, shown as the selected option until a preset is picked. */
const CURRENT = 'current';

/** The "Anyone with the link" switch, with the link itself, its expiry, version and reset. */
export function LinkAccess({ artifactId, link }: { artifactId: string; link: ShareLink | null }) {
  const setLink = useSetShareLink(artifactId);
  const turnOff = useTurnOffShareLink(artifactId);
  const reset = useResetShareLink(artifactId);
  const busy = setLink.isPending || turnOff.isPending || reset.isPending;
  const switchId = useId();
  const hintId = `${switchId}-hint`;

  const onToggle = (on: boolean) => {
    if (on) {
      setLink.mutate(
        { expiresAt: expiresAtFor(DEFAULT_EXPIRY), versionNo: null },
        { onError: toastError },
      );
    } else {
      turnOff.mutate(undefined, { onError: toastError });
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <GlobeIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="grid min-w-0 flex-1 gap-1">
          <Label htmlFor={switchId}>Anyone with the link</Label>
          <p id={hintId} className="text-xs text-muted-foreground">
            {link === null
              ? "Off: there's no link."
              : isLinkActive(link)
                ? `On: works without signing in. ${expiryLabel(link)}.`
                : 'Expired: choose a new expiry to make it work again.'}
          </p>
        </div>
        <Switch
          id={switchId}
          aria-describedby={hintId}
          checked={link !== null}
          disabled={busy}
          onCheckedChange={onToggle}
        />
      </div>

      {link ? (
        <>
          <div className="flex gap-2">
            <Input
              readOnly
              value={link.url}
              aria-label="Link URL"
              onFocus={(event) => event.target.select()}
              className="font-mono text-xs"
            />
            <Button type="button" variant="outline" onClick={() => void copyWithToast(link.url)}>
              <CopyIcon aria-hidden="true" />
              Copy
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <NativeSelect
              aria-label="Link expiry"
              value={link.expiresAt === null ? 'never' : CURRENT}
              disabled={busy}
              onChange={(event) =>
                setLink.mutate(
                  {
                    expiresAt: expiresAtFor(event.target.value as ExpiryPreset),
                    versionNo: link.pinnedVersionNo,
                  },
                  { onError: toastError },
                )
              }
            >
              {link.expiresAt === null ? null : (
                <option value={CURRENT}>{expiryLabel(link)}</option>
              )}
              {EXPIRY_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.value === 'never' ? 'Never expires' : `Expires in ${preset.label}`}
                </option>
              ))}
            </NativeSelect>
            <VersionSelect
              aria-label="Version for the link"
              artifactId={artifactId}
              value={link.pinnedVersionNo}
              // Changing the version keeps the expiry, which must not have passed.
              disabled={busy || !isLinkActive(link)}
              onChange={(versionNo) =>
                setLink.mutate({ expiresAt: link.expiresAt, versionNo }, { onError: toastError })
              }
            />
            <ResetLinkButton
              disabled={busy}
              onConfirm={() =>
                reset.mutate(undefined, {
                  onSuccess: () => toast.success('New link created'),
                  onError: toastError,
                })
              }
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function ResetLinkButton({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="ml-auto" disabled={disabled}>
          <RefreshCwIcon aria-hidden="true" />
          Reset link
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset the link?</AlertDialogTitle>
          <AlertDialogDescription>
            The current link stops working for everyone who has it. You get a new one with the same
            settings to share again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Reset link</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
