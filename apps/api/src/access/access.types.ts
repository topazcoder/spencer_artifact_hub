import type { ArtifactStatus, ArtifactVisibility } from '@artifact-hub/shared';

export type AccessAction = 'view' | 'comment' | 'edit' | 'share' | 'delete';

/** The artifact fields access decisions depend on. */
export interface AccessTarget {
  id: string;
  ownerId: string;
  visibility: ArtifactVisibility;
  status: ArtifactStatus;
  deletedAt: Date | null;
}

/**
 * Why access was denied; logged at debug, never shown to the caller. `private`: the actor has
 * no access at all; `owner_only`: they may view, but the action is the owner's.
 */
export type DenialReason = 'deleted' | 'draft' | 'private' | 'owner_only';
