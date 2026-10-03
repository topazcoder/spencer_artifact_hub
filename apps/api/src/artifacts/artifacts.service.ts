import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type CreateArtifactMetadata, ErrorCode } from '@artifact-hub/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DataSource, type Repository } from 'typeorm';
import { z } from 'zod';
import {
  ARTIFACT_NOT_FOUND_MESSAGE,
  AccessPolicyService,
} from '../access/access-policy.service.js';
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
  ArtifactListOptions,
  ArtifactPage,
  NewContent,
} from './artifacts.types.js';

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
  ): Promise<Artifact> {
    const artifactId = randomUUID();
    const log = { userId: actor.userId, artifactId, via: actor.via };
    this.logger.info(log, 'Publish received');

    const { mimeType, body } = await this.inspector.inspect(content.stream, content);
    this.logger.info({ ...log, mimeType }, 'Content type detected');

    const storageKey = blobKeys.artifactVersion(artifactId, 1);
    const started = performance.now();
    const blob = await this.storage.put(storageKey, body, { contentType: mimeType });
    this.logger.info(
      { ...log, bytes: blob.size, ms: Math.round(performance.now() - started) },
      'Blob stored',
    );

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
        const inserted = await manager.insert(ArtifactVersion, {
          artifactId,
          versionNo: 1,
          storageKey,
          mimeType,
          sizeBytes: blob.size,
          sha256: blob.sha256,
          originalFilename: sanitizeFilename(content.filename),
          changeNote: null,
          createdBy: actor.userId,
        });
        await manager.update(Artifact, artifactId, {
          currentVersionId: inserted.identifiers[0]?.id as string,
          latestVersionNo: 1,
          status: 'published',
        });
      });
    } catch (error) {
      await this.deleteBlobQuietly(storageKey, log);
      throw error;
    }
    this.logger.info({ ...log, versionNo: 1 }, 'Version committed');

    return this.get(actor, artifactId);
  }

  /** The artifact with its owner and current version. `NOT_FOUND` if missing or not visible. */
  async get(actor: Actor, id: string): Promise<Artifact> {
    const artifact = idSchema.safeParse(id).success
      ? await this.artifacts.findOne({
          where: { id },
          relations: { owner: true, currentVersion: true },
        })
      : null;
    if (!artifact) throw new AppError(ErrorCode.NOT_FOUND, ARTIFACT_NOT_FOUND_MESSAGE);
    this.access.assertCan(actor, 'view', artifact);
    return artifact;
  }

  /**
   * The content of version `versionNo` (as given in the URL). `NOT_FOUND` if the artifact is
   * not visible to the actor or has no such version.
   */
  async getContent(actor: Actor, id: string, versionNo: string): Promise<ArtifactContent> {
    const artifact = await this.get(actor, id);
    const version = VERSION_NO.test(versionNo)
      ? await this.versions.findOneBy({ artifactId: artifact.id, versionNo: Number(versionNo) })
      : null;
    if (!version) throw new AppError(ErrorCode.NOT_FOUND, 'Version not found.');
    return { artifact, version, open: () => this.storage.getStream(version.storageKey) };
  }

  /**
   * Published artifacts the actor may view, most recently updated first, optionally narrowed by
   * `options` (e.g. `ownerId`). Filters only ever narrow what `AccessPolicy` allows.
   */
  async list(actor: Actor, options: ArtifactListOptions): Promise<ArtifactPage> {
    const qb = this.artifacts
      .createQueryBuilder('artifact')
      .innerJoinAndSelect('artifact.owner', 'owner')
      .leftJoinAndSelect('artifact.currentVersion', 'currentVersion')
      .where("artifact.status = 'published'")
      // `id` breaks ties, so the order (and therefore each page) is deterministic.
      .orderBy('artifact.updatedAt', 'DESC')
      .addOrderBy('artifact.id', 'DESC')
      // Joins are to-one, so OFFSET/LIMIT count artifacts, not joined rows.
      .offset((options.page - 1) * options.pageSize)
      .limit(options.pageSize);
    this.access.restrictToViewable(qb, 'artifact', actor);

    if (options.ownerId) {
      qb.andWhere('artifact.ownerId = :ownerId', { ownerId: options.ownerId });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
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
