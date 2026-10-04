import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  type ArtifactListQuery,
  type ArtifactListResponse,
  type ArtifactListScope,
  type ArtifactTagListQuery,
  type ArtifactTagListResponse,
  ARTIFACT_TAG_SUGGESTION_MAX,
  ARTIFACT_TYPE_FILTERS,
  artifactTagListQuerySchema,
  type ArtifactResponse,
  type ArtifactVersionListResponse,
  ErrorCode,
  type UpdateArtifactMetadata,
  artifactListQuerySchema,
  createArtifactRequestSchema,
  createVersionRequestSchema,
  updateArtifactRequestSchema,
} from '@artifact-hub/shared';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { CurrentActor } from '../auth/auth.decorators.js';
import type { Actor } from '../auth/auth.types.js';
import { AppError } from '../common/errors/app-error.js';
import { IdempotencyService } from '../common/idempotency/idempotency.service.js';
import { requestFingerprint } from '../common/idempotency/request-fingerprint.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { InjectEnv } from '../config/config.module.js';
import type { Env } from '../config/config.types.js';
import { readMultipartUpload } from '../uploads/multipart/read-multipart-upload.js';
import { toArtifactVersionDto } from './artifact-version.entity.js';
import { toArtifactDto } from './artifact.entity.js';
import { ArtifactsService } from './artifacts.service.js';
import type { ArtifactListOptions, ArtifactView, NewContent } from './artifacts.types.js';
import { sendVersionContent } from './content/send-version-content.js';

/** What each gallery scope narrows the list to. */
const SCOPE_FILTERS: Record<
  ArtifactListScope,
  (actor: Actor) => Pick<ArtifactListOptions, 'ownerId' | 'sharedWith' | 'visibility'>
> = {
  mine: (actor) => ({ ownerId: actor.userId }),
  shared: (actor) => ({ sharedWith: actor.userId }),
  public: () => ({ visibility: 'public' }),
};

/** The multipart field with the JSON metadata; it must come before the `file` field. */
const METADATA_FIELD = 'metadata';

@Controller('artifacts')
export class ArtifactsController {
  constructor(
    private readonly artifacts: ArtifactsService,
    private readonly idempotency: IdempotencyService,
    @InjectEnv() private readonly env: Env,
    @InjectPinoLogger(ArtifactsController.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Multipart: a `metadata` JSON field (`CreateArtifactRequest`), then the `file`. Takes an
   * `Idempotency-Key`.
   */
  @Post()
  create(@CurrentActor() actor: Actor, @Req() req: Request): Promise<ArtifactResponse> {
    return this.receiveUpload(req, actor, createArtifactRequestSchema, (metadata, content) =>
      this.artifacts.create(actor, metadata, content),
    );
  }

  /**
   * Multipart: a `metadata` JSON field (`CreateVersionRequest`), then the `file`. Takes an
   * `Idempotency-Key`.
   */
  @Post(':id/versions')
  addVersion(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<ArtifactResponse> {
    return this.receiveUpload(req, actor, createVersionRequestSchema, (metadata, content) =>
      this.artifacts.addVersion(actor, id, metadata, content),
    );
  }

  @Get(':id/versions')
  async listVersions(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
  ): Promise<ArtifactVersionListResponse> {
    const versions = await this.artifacts.listVersions(actor, id);
    return { items: versions.map(toArtifactVersionDto) };
  }

  @Get()
  async list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(artifactListQuerySchema)) query: ArtifactListQuery,
  ): Promise<ArtifactListResponse> {
    const { scope, q, type, tag, owner, ownerId, updatedFrom, updatedTo, sort, page, pageSize } =
      query;
    const { items, total } = await this.artifacts.list(actor, {
      ...SCOPE_FILTERS[scope](actor),
      search: q,
      mimeTypes: type ? ARTIFACT_TYPE_FILTERS[type] : undefined,
      tags: tag,
      owners: owner,
      ownedBy: ownerId,
      updatedFrom,
      updatedTo,
      sort,
      page,
      pageSize,
    });
    return { items: items.map(toArtifactDto), page, pageSize, total };
  }

  /**
   * A few of the tags used in a gallery scope, the most used first and only those containing
   * `q`, for its tag filter. Declared before `:id`.
   */
  @Get('tags')
  async listTags(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(artifactTagListQuerySchema)) { scope, q }: ArtifactTagListQuery,
  ): Promise<ArtifactTagListResponse> {
    return {
      items: await this.artifacts.listTags(actor, SCOPE_FILTERS[scope](actor), {
        search: q,
        limit: ARTIFACT_TAG_SUGGESTION_MAX,
      }),
    };
  }

  /** A version's bytes with the sandbox headers; `?download=1` saves it as a file. */
  @Get(':id/versions/:no/content')
  async content(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('no') versionNo: string,
    @Query('download') download: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const content = await this.artifacts.getContent(actor, id, versionNo);
    await sendVersionContent(req, res, content, {
      download: download === '1',
      logger: this.logger,
    });
  }

  @Get(':id')
  async get(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<ArtifactResponse> {
    return { artifact: toArtifactDto(await this.artifacts.get(actor, id)) };
  }

  /** Metadata and visibility. New content goes through `POST :id/versions` instead. */
  @Patch(':id')
  async update(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateArtifactRequestSchema)) changes: UpdateArtifactMetadata,
  ): Promise<ArtifactResponse> {
    return { artifact: toArtifactDto(await this.artifacts.update(actor, id, changes)) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<void> {
    await this.artifacts.remove(actor, id);
  }

  /**
   * Reads a multipart upload and hands its metadata and file to `publish`, once per
   * `Idempotency-Key`. A repeat must send the same metadata and filename (the file itself is
   * not compared), and gets the artifact as it is now.
   */
  private async receiveUpload<T extends z.ZodType>(
    req: Request,
    actor: Actor,
    schema: T,
    publish: (metadata: z.output<T>, content: NewContent) => Promise<ArtifactView>,
  ): Promise<ArtifactResponse> {
    const upload = await readMultipartUpload(req, { maxFileBytes: this.env.MAX_ARTIFACT_BYTES });
    try {
      const metadata = parseMetadata(upload.fields[METADATA_FIELD], schema);
      const { stream, filename } = upload.file;
      return await this.idempotency.run(req, actor, {
        execute: async () => {
          const view = await publish(metadata, { stream, filename });
          return { result: { artifact: toArtifactDto(view) }, resourceId: view.artifact.id };
        },
        replay: async (artifactId) => ({
          artifact: toArtifactDto(await this.artifacts.get(actor, artifactId)),
        }),
        // Answered once the rest has arrived, so the answer reaches clients behind proxies.
        skip: () => upload.discard(),
        fingerprint: requestFingerprint({ metadata, filename }),
      });
    } catch (error) {
      await upload.discard();
      throw error;
    }
  }
}

/** Parses the JSON in the `metadata` field with `schema`. */
function parseMetadata<T extends z.ZodType>(raw: string | undefined, schema: T): z.output<T> {
  let value: unknown;
  try {
    value = JSON.parse(raw ?? '');
  } catch {
    throw new AppError(
      ErrorCode.VALIDATION_FAILED,
      `Send the details as JSON in a "${METADATA_FIELD}" field before the file.`,
    );
  }
  return schema.parse(value);
}
