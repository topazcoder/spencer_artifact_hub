import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ARTIFACT_TAG_LIST_MAX,
  type CreateArtifactMetadata,
  type CreateVersionMetadata,
  ErrorCode,
  type UpdateArtifactMetadata,
} from '@artifact-hub/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  DataSource,
  type EntityManager,
  In,
  IsNull,
  type Repository,
  type SelectQueryBuilder,
} from 'typeorm';
import { z } from 'zod';
import { AccessGrantsService } from '../access/access-grants.service.js';
import {
  ARTIFACT_NOT_FOUND_MESSAGE,
  AccessPolicyService,
} from '../access/access-policy.service.js';
import type { AccessAction, AccessGrant, AccessTarget } from '../access/access.types.js';
import type { Actor } from '../auth/auth.types.js';
import { AppError } from '../common/errors/app-error.js';
import { blobKeys } from '../storage/blob-keys.js';
import { InjectStorage } from '../storage/storage.module.js';
import type { StorageDriver } from '../storage/storage.types.js';
import { ContentInspectorService } from '../uploads/content/content-inspector.service.js';
import { sanitizeFilename } from '../uploads/content/sanitize-filename.js';
import { ArtifactVersion } from './artifact-version.entity.js';
import { Artifact } from './artifact.entity.js';
import type {
  ArtifactContent,
  ArtifactFilters,
  ArtifactListOptions,
  ArtifactPage,
  ArtifactView,
  NewContent,
  ResolvedArtifact,
  StoredContent,
  TagCount,
} from './artifacts.types.js';
import { prefixTsquery } from './search/prefix-tsquery.js';

const idSchema = z.guid();
const VERSION_NO = /^[1-9]\d{0,8}$/;

/** Artifacts and their versions. Every method takes the `Actor` and checks `AccessPolicy`. */
@Injectable()
export class ArtifactsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Artifact) private readonly artifacts: Repository<Artifact>,
    @InjectRepository(ArtifactVersion) private readonly versions: Repository<ArtifactVersion>,
    private readonly inspector: ContentInspectorService,
    @InjectStorage() private readonly storage: StorageDriver,
    private readonly access: AccessPolicyService,
    private readonly grants: AccessGrantsService,
    @InjectPinoLogger(ArtifactsService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Publishes a new artifact with `content` as version 1 (plan §6): detect the type, store the
   * blob, then insert the rows in one transaction. The blob is deleted if the insert fails.
   */
  async create(
    actor: Actor,
    metadata: CreateArtifactMetadata,
    content: NewContent,
  ): Promise<ArtifactView> {
    const artifactId = randomUUID();
    const log = { userId: actor.userId, artifactId, via: actor.via };
    this.logger.info(log, 'Publish received');

    const stored = await this.storeContent(artifactId, 1, content, log);
    try {
      await this.dataSource.transaction(async (manager) => {
        // Inserted as a draft first: a published artifact must point at a version.
        await manager.insert(Artifact, {
          id: artifactId,
          ownerId: actor.userId,
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          visibility: metadata.visibility,
          status: 'draft',
          metadataSource: 'user',
          latestVersionNo: 0,
        });
        await this.insertVersion(manager, actor, artifactId, 1, stored, null);
      });
    } catch (error) {
      await this.deleteBlobQuietly(stored.storageKey, log);
      throw error;
    }
    this.logger.info({ ...log, versionNo: 1 }, 'Version committed');

    return this.get(actor, artifactId);
  }

  /**
   * Adds `content` as the next version and makes it current. Only the owner may. The artifact
   * row is locked while the version is numbered; if another version was committed since the
   * number was picked for the blob key, this fails with `CONFLICT` and the client can retry.
   */
  async addVersion(
    actor: Actor,
    id: string,
    metadata: CreateVersionMetadata,
    content: NewContent,
  ): Promise<ArtifactView> {
    const { artifact } = await this.getForAction(actor, id, 'edit');
    const versionNo = artifact.latestVersionNo + 1;
    const log = { userId: actor.userId, artifactId: artifact.id, via: actor.via };
    this.logger.info({ ...log, versionNo }, 'New version received');

    const stored = await this.storeContent(artifact.id, versionNo, content, log);
    try {
      await this.dataSource.transaction(async (manager) => {
        const locked = await manager.findOne(Artifact, {
          where: { id: artifact.id, deletedAt: IsNull() },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked) throw new AppError(ErrorCode.NOT_FOUND, ARTIFACT_NOT_FOUND_MESSAGE);
        if (locked.latestVersionNo !== versionNo - 1) {
          throw new AppError(
            ErrorCode.CONFLICT,
            'Another version was published at the same time. Try again.',
          );
        }
        await this.insertVersion(
          manager,
          actor,
          artifact.id,
          versionNo,
          stored,
          metadata.changeNote || null,
        );
      });
    } catch (error) {
      await this.deleteBlobQuietly(stored.storageKey, log);
      throw error;
    }
    this.logger.info({ ...log, versionNo }, 'Version committed');

    return this.get(actor, artifact.id);
  }

  /** The versions the actor may see (all, unless a share limits them), newest first. */
  async listVersions(actor: Actor, id: string): Promise<ArtifactVersion[]> {
    const { artifact, target } = await this.resolve(actor, id);
    this.access.assertCan(actor, 'view', target);
    const visible = this.access.visibleVersionIds(actor, target);
    return this.versions.find({
      where: { artifactId: artifact.id, ...(visible ? { id: In([...visible]) } : {}) },
      order: { versionNo: 'DESC' },
    });
  }

  /** Changes the title, description or tags. Never creates a version. Owner only. */
  async update(actor: Actor, id: string, changes: UpdateArtifactMetadata): Promise<ArtifactView> {
    const { artifact } = await this.getForAction(actor, id, 'edit');

    await this.artifacts.update({ id: artifact.id, deletedAt: IsNull() }, changes);
    this.logger.info(
      { userId: actor.userId, artifactId: artifact.id, fields: Object.keys(changes) },
      'Artifact updated',
    );

    return this.get(actor, artifact.id);
  }

  /**
   * Soft delete: the artifact disappears for everyone, owner included, at once. Its rows and
   * blobs are kept. Owner only.
   */
  async remove(actor: Actor, id: string): Promise<void> {
    const { artifact } = await this.getForAction(actor, id, 'delete');
    await this.artifacts.update(
      { id: artifact.id, deletedAt: IsNull() },
      { deletedAt: new Date() },
    );
    this.logger.info({ userId: actor.userId, artifactId: artifact.id }, 'Artifact deleted');
  }

  /** The artifact as the actor sees it. `NOT_FOUND` if missing or not visible. */
  get(actor: Actor, id: string): Promise<ArtifactView> {
    return this.getForAction(actor, id, 'view');
  }

  /**
   * The artifact as the actor sees it, if they may perform `action` on it (`NOT_FOUND` or
   * `FORBIDDEN` otherwise, see `AccessPolicyService.assertCan`). For other modules acting on an
   * artifact, e.g. sharing it.
   */
  async getForAction(actor: Actor, id: string, action: AccessAction): Promise<ArtifactView> {
    const { artifact, target } = await this.resolve(actor, id);
    this.access.assertCan(actor, action, target);
    return this.toView(actor, artifact, target);
  }

  /**
   * The content of version `versionNo` (as given in the URL). `NOT_FOUND` if the artifact is
   * not visible to the actor, or has no such version that they may see.
   */
  async getContent(actor: Actor, id: string, versionNo: string): Promise<ArtifactContent> {
    const { artifact, target } = await this.resolve(actor, id);
    this.access.assertCan(actor, 'view', target);
    const version = VERSION_NO.test(versionNo)
      ? await this.versions.findOneBy({ artifactId: artifact.id, versionNo: Number(versionNo) })
      : null;
    const visible = this.access.visibleVersionIds(actor, target);
    if (!version || (visible && !visible.has(version.id))) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Version not found.');
    }
    return { artifact, version, open: () => this.storage.getStream(version.storageKey) };
  }

  /**
   * Published artifacts the actor may view, narrowed by `options`: the most relevant first when
   * searching, otherwise the most recently updated.
   */
  async list(actor: Actor, options: ArtifactListOptions): Promise<ArtifactPage> {
    const { qb, tsquery } = this.filtered(actor, options);
    qb.innerJoinAndSelect('artifact.owner', 'owner')
      .leftJoinAndSelect('artifact.currentVersion', 'currentVersion')
      // Joins are to-one, so OFFSET/LIMIT count artifacts, not joined rows.
      .offset((options.page - 1) * options.pageSize)
      .limit(options.pageSize);
    if (tsquery) {
      // Weighted by where words match: title (A) above tags, description and content. Not
      // ts_rank_cd: it rewards nearby words, and the end of one field sits next to the start
      // of the next in the vector.
      qb.orderBy(`ts_rank(artifact.searchVector, to_tsquery('english', :tsquery))`, 'DESC');
    }
    // `id` breaks ties, so the order (and therefore each page) is deterministic.
    qb.addOrderBy('artifact.updatedAt', 'DESC').addOrderBy('artifact.id', 'DESC');

    const [artifacts, total] = await qb.getManyAndCount();
    const grants = await this.grants.forArtifacts(
      actor,
      artifacts.filter((artifact) => needsGrants(actor, artifact)).map((artifact) => artifact.id),
    );
    const items = await Promise.all(
      artifacts.map((artifact) =>
        this.toView(actor, artifact, accessTarget(artifact, grants.get(artifact.id) ?? [])),
      ),
    );
    return { items, total };
  }

  /** The tags of the artifacts `filters` cover, the most used first, for the gallery's filter. */
  async listTags(actor: Actor, filters: ArtifactFilters): Promise<TagCount[]> {
    const { qb } = this.filtered(actor, filters);
    const [scoped, parameters] = qb.select('artifact.tags', 'tags').getQueryAndParameters();
    return this.dataSource.query(
      `SELECT tag, count(*)::int AS count
       FROM (${scoped}) scoped CROSS JOIN LATERAL unnest(scoped.tags) AS tag
       GROUP BY tag ORDER BY count DESC, tag ASC LIMIT $${parameters.length + 1}`,
      [...parameters, ARTIFACT_TAG_LIST_MAX],
    );
  }

  /** Published artifacts the actor may view, narrowed by `filters`. */
  private filtered(
    actor: Actor,
    filters: ArtifactFilters,
  ): { qb: SelectQueryBuilder<Artifact>; tsquery: string | null } {
    const qb = this.artifacts.createQueryBuilder('artifact').where("artifact.status = 'published'");
    this.access.restrictToViewable(qb, 'artifact', actor);

    if (filters.ownerId) {
      qb.andWhere('artifact.ownerId = :ownerId', { ownerId: filters.ownerId });
    }
    if (filters.visibility) {
      qb.andWhere('artifact.visibility = :visibility', { visibility: filters.visibility });
    }
    if (filters.sharedWith) {
      qb.andWhere('artifact.ownerId != :sharedWith').andWhere(
        `EXISTS (SELECT 1 FROM shares share
                 WHERE share.artifact_id = artifact.id AND share.user_id = :sharedWith)`,
        { sharedWith: filters.sharedWith },
      );
    }
    if (filters.mimeTypes) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM artifact_versions type_version
                 WHERE type_version.id = artifact.current_version_id
                   AND type_version.mime_type IN (:...mimeTypes))`,
        { mimeTypes: filters.mimeTypes },
      );
    }
    if (filters.tag) {
      qb.andWhere('artifact.tags @> ARRAY[:tag]::text[]', { tag: filters.tag });
    }
    const tsquery = filters.search ? prefixTsquery(filters.search) : null;
    if (tsquery) {
      qb.andWhere(`artifact.searchVector @@ to_tsquery('english', :tsquery)`, { tsquery });
    }
    return { qb, tsquery };
  }

  /** Loads the artifact and what access decisions need. `NOT_FOUND` if it doesn't exist. */
  private async resolve(actor: Actor, id: string): Promise<ResolvedArtifact> {
    const artifact = idSchema.safeParse(id).success
      ? await this.artifacts.findOne({
          where: { id },
          relations: { owner: true, currentVersion: true },
        })
      : null;
    if (!artifact) throw new AppError(ErrorCode.NOT_FOUND, ARTIFACT_NOT_FOUND_MESSAGE);
    const grants = needsGrants(actor, artifact)
      ? await this.grants.forArtifact(actor, artifact.id)
      : [];
    return { artifact, target: accessTarget(artifact, grants) };
  }

  /**
   * What the actor sees of a viewable artifact: viewers limited to pinned versions see the
   * newest of those as current, and nothing about later ones.
   */
  private async toView(
    actor: Actor,
    artifact: Artifact,
    target: AccessTarget,
  ): Promise<ArtifactView> {
    const permissions = this.access.permissions(actor, target);
    const visible = this.access.visibleVersionIds(actor, target);
    if (!visible) {
      return {
        artifact,
        currentVersion: artifact.currentVersion,
        latestVersionNo: artifact.latestVersionNo,
        permissions,
      };
    }
    const currentVersion =
      artifact.currentVersion && visible.has(artifact.currentVersion.id)
        ? artifact.currentVersion
        : await this.versions.findOne({
            where: { artifactId: artifact.id, id: In([...visible]) },
            order: { versionNo: 'DESC' },
          });
    return {
      artifact,
      currentVersion,
      latestVersionNo: currentVersion?.versionNo ?? 0,
      permissions,
    };
  }

  /** Detects the content's type and stores it under a fresh key for `versionNo`. */
  private async storeContent(
    artifactId: string,
    versionNo: number,
    content: NewContent,
    log: Record<string, string>,
  ): Promise<StoredContent> {
    const { mimeType, body } = await this.inspector.inspect(content.stream, content);
    this.logger.info({ ...log, mimeType }, 'Content type detected');

    const storageKey = blobKeys.artifactVersion(artifactId, versionNo);
    const started = performance.now();
    const { size, sha256 } = await this.storage.put(storageKey, body, { contentType: mimeType });
    this.logger.info(
      { ...log, bytes: size, ms: Math.round(performance.now() - started) },
      'Blob stored',
    );
    return {
      storageKey,
      mimeType,
      size,
      sha256,
      originalFilename: sanitizeFilename(content.filename),
    };
  }

  /** Inserts version `versionNo` and makes it the artifact's current, published version. */
  private async insertVersion(
    manager: EntityManager,
    actor: Actor,
    artifactId: string,
    versionNo: number,
    stored: StoredContent,
    changeNote: string | null,
  ): Promise<void> {
    const inserted = await manager.insert(ArtifactVersion, {
      artifactId,
      versionNo,
      storageKey: stored.storageKey,
      mimeType: stored.mimeType,
      sizeBytes: stored.size,
      sha256: stored.sha256,
      originalFilename: stored.originalFilename,
      changeNote,
      createdBy: actor.userId,
    });
    await manager.update(Artifact, artifactId, {
      currentVersionId: inserted.identifiers[0]?.id as string,
      latestVersionNo: versionNo,
      status: 'published',
    });
  }

  /** Best effort: the sweeper removes blobs without a version row if this fails. */
  private async deleteBlobQuietly(key: string, log: Record<string, string>): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (err) {
      this.logger.warn({ ...log, err }, 'Could not delete the blob of a failed publish');
    }
  }
}

/**
 * Whether the actor's shares can change what they may do or see. Not for their own artifacts,
 * nor for public ones showing every version (company access already gives the most).
 */
function needsGrants(actor: Actor, artifact: Artifact): boolean {
  if (artifact.ownerId === actor.userId) return false;
  return artifact.visibility === 'private' || artifact.publicPinnedVersionId !== null;
}

function accessTarget(artifact: Artifact, grants: readonly AccessGrant[]): AccessTarget {
  return {
    id: artifact.id,
    ownerId: artifact.ownerId,
    visibility: artifact.visibility,
    status: artifact.status,
    deletedAt: artifact.deletedAt,
    publicPinnedVersionId: artifact.publicPinnedVersionId,
    grants,
  };
}
