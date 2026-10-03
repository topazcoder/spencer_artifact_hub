import { SHARE_PERMISSIONS, type SharePermission } from '@artifact-hub/shared';
import type { ComponentProps } from 'react';
import { NativeSelect } from '@/components/ui/native-select.tsx';
import { useArtifactVersions } from '@/features/artifacts/use-artifacts.ts';

const PERMISSION_LABELS: Record<SharePermission, string> = {
  view: 'Can view',
  comment: 'Can comment',
};

type SelectProps = Omit<ComponentProps<typeof NativeSelect>, 'value' | 'onChange'>;

/** "Can view" / "Can comment". */
export function PermissionSelect({
  value,
  onChange,
  ...props
}: SelectProps & { value: SharePermission; onChange: (permission: SharePermission) => void }) {
  return (
    <NativeSelect
      value={value}
      onChange={(event) => onChange(event.target.value as SharePermission)}
      {...props}
    >
      {SHARE_PERMISSIONS.map((permission) => (
        <option key={permission} value={permission}>
          {PERMISSION_LABELS[permission]}
        </option>
      ))}
    </NativeSelect>
  );
}

const ALL = 'all';

/**
 * "All versions" (following the latest, history included) or "Only vN": `null` stands for all.
 */
export function VersionSelect({
  artifactId,
  value,
  onChange,
  ...props
}: SelectProps & {
  artifactId: string;
  value: number | null;
  onChange: (versionNo: number | null) => void;
}) {
  const { data: versions } = useArtifactVersions(artifactId);
  return (
    <NativeSelect
      value={value === null ? ALL : String(value)}
      onChange={(event) => onChange(event.target.value === ALL ? null : Number(event.target.value))}
      {...props}
    >
      <option value={ALL}>All versions</option>
      {versions?.map((version) => (
        <option key={version.id} value={String(version.versionNo)}>
          Only v{version.versionNo}
        </option>
      ))}
      {/* A pinned version shows even before the list has loaded. */}
      {value !== null && !versions ? <option value={String(value)}>Only v{value}</option> : null}
    </NativeSelect>
  );
}
