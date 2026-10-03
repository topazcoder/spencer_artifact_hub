import type { ArtifactAccess } from '@artifact-hub/shared';
import { BuildingIcon } from 'lucide-react';
import { useId } from 'react';
import { Label } from '@/components/ui/label.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { toastError } from '@/lib/toast-error.ts';
import { VersionSelect } from './access-selects.tsx';
import { useSetCompanyAccess } from './use-sharing.ts';

/** The "Everyone at the company" switch, with the version they see. */
export function CompanyAccess({
  artifactId,
  company,
}: {
  artifactId: string;
  company: ArtifactAccess['company'];
}) {
  const setCompany = useSetCompanyAccess(artifactId);
  const switchId = useId();
  const hintId = `${switchId}-hint`;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <BuildingIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="grid min-w-0 flex-1 basis-48 gap-1">
        <Label htmlFor={switchId}>Everyone at the company</Label>
        <p id={hintId} className="text-xs text-muted-foreground">
          {company.enabled
            ? 'On: everyone signed in can see it.'
            : 'Off: only you and the people you added can see it.'}
        </p>
      </div>
      {company.enabled ? (
        <VersionSelect
          aria-label="Version for everyone at the company"
          artifactId={artifactId}
          value={company.pinnedVersionNo}
          disabled={setCompany.isPending}
          onChange={(versionNo) =>
            setCompany.mutate({ enabled: true, versionNo }, { onError: toastError })
          }
        />
      ) : null}
      <Switch
        id={switchId}
        aria-describedby={hintId}
        checked={company.enabled}
        disabled={setCompany.isPending}
        onCheckedChange={(enabled) =>
          setCompany.mutate(
            { enabled, versionNo: enabled ? company.pinnedVersionNo : null },
            { onError: toastError },
          )
        }
      />
    </div>
  );
}
