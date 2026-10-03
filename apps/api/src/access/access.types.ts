import type { ArtifactStatus, ArtifactVisibility, SharePermission } from '@artifact-hub/shared';

export type AccessAction = 'view' | 'comment' | 'edit' | 'share' | 'delete';

/** The artifact fields access decisions depend on. */
export interface AccessTarget {
  id: string;
  ownerId: string;
  visibility: ArtifactVisibility;
  status: ArtifactStatus;
  deletedAt: Date | null;
  /** The version a public artifact shows everyone at the company; null = the latest. */
  publicPinnedVersionId: string | null;
  /**
   * The actor's shares of the artifact (`AccessGrantsService`). Only needed for other users'
   * artifacts; pass `[]` otherwise. Missing grants only ever deny.
   */
  grants: readonly AccessGrant[];
}

/** Access a share gives the actor. */
export interface AccessGrant {
  permission: SharePermission;
  /** The only version it shows; null = every version. */
  pinnedVersionId: string | null;
}

/**
 * Why access was denied; logged at debug, never shown to the caller. `private`: the actor has
 * no access at all; `owner_only`: they may view, but the action is the owner's; `view_only`:
 * their shares don't allow commenting.
 */
export type DenialReason = 'deleted' | 'draft' | 'private' | 'owner_only' | 'view_only';
