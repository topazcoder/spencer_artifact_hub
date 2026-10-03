import type { ArtifactVisibility } from '@artifact-hub/shared';

export type AccessAction = 'view' | 'comment' | 'edit' | 'share' | 'delete';

/** The artifact fields access decisions depend on. */
export interface AccessTarget {
  id: string;
  ownerId: string;
  visibility: ArtifactVisibility;
  deletedAt: Date | null;
}

/** Why access was denied; logged at debug, never shown to the caller. */
export type DenialReason = 'deleted' | 'not_owner';
