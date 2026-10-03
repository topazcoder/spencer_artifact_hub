import { Injectable } from '@nestjs/common';
import type { SharePermission } from '@artifact-hub/shared';
import { DataSource } from 'typeorm';
import type { Actor } from '../auth/auth.types.js';
import type { AccessGrant } from './access.types.js';

interface GrantRow {
  artifact_id: string;
  permission: SharePermission;
  pinned_version_id: string | null;
}

/**
 * Loads the shares that give a user access to artifacts. Read on every request, so removing
 * someone takes effect at once.
 */
@Injectable()
export class AccessGrantsService {
  constructor(private readonly dataSource: DataSource) {}

  async forArtifact(actor: Actor, artifactId: string): Promise<AccessGrant[]> {
    return (await this.forArtifacts(actor, [artifactId])).get(artifactId) ?? [];
  }

  /** Grants by artifact id; artifacts without any are missing from the map. */
  async forArtifacts(actor: Actor, artifactIds: string[]): Promise<Map<string, AccessGrant[]>> {
    const grants = new Map<string, AccessGrant[]>();
    if (artifactIds.length === 0) return grants;

    const rows: GrantRow[] = await this.dataSource.query(
      `SELECT artifact_id, permission, pinned_version_id FROM shares
       WHERE user_id = $1 AND artifact_id = ANY($2::uuid[])`,
      [actor.userId, artifactIds],
    );
    for (const row of rows) {
      const grant: AccessGrant = {
        permission: row.permission,
        pinnedVersionId: row.pinned_version_id,
      };
      grants.set(row.artifact_id, [...(grants.get(row.artifact_id) ?? []), grant]);
    }
    return grants;
  }
}
