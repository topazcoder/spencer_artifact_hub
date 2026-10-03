import { pipeline } from 'node:stream/promises';
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
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { InjectEnv } from '../config/config.module.js';
import type { Env } from '../config/config.types.js';
import { readMultipartUpload } from '../uploads/multipart/read-multipart-upload.js';
import { toArtifactVersionDto } from './artifact-version.entity.js';
import { toArtifactDto } from './artifact.entity.js';
import { ArtifactsService } from './artifacts.service.js';
import { attachmentDisposition, downloadFilename } from './content/content-disposition.js';
import {
  CONTENT_SECURITY_HEADERS,
  etagMatches,
  servedContentType,
} from './content/content-headers.js';

/** The multipart field with the JSON metadata; it must come before the `file` field. */
const METADATA_FIELD = 'metadata';

@Controller('artifacts')
export class ArtifactsController {
  constructor(
    private readonly artifacts: ArtifactsService,
    @InjectEnv() private readonly env: Env,
    @InjectPinoLogger(ArtifactsController.name) private readonly logger: PinoLogger,
  ) {}

  /** Multipart: a `metadata` JSON field (`CreateArtifactRequest`), then the `file`. */
  @Post()
  async create(@CurrentActor() actor: Actor, @Req() req: Request): Promise<ArtifactResponse> {
    const upload = await readMultipartUpload(req, { maxFileBytes: this.env.MAX_ARTIFACT_BYTES });
    try {
      const metadata = parseMetadata(upload.fields[METADATA_FIELD], createArtifactRequestSchema);
      const artifact = await this.artifacts.create(actor, metadata, {
        stream: upload.file.stream,
        filename: upload.file.filename,
      });
      return { artifact: toArtifactDto(artifact) };
    } catch (error) {
      upload.discard();
      throw error;
    }
  }

  /** Multipart: a `metadata` JSON field (`CreateVersionRequest`), then the `file`. */
  @Post(':id/versions')
  async addVersion(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<ArtifactResponse> {
    const upload = await readMultipartUpload(req, { maxFileBytes: this.env.MAX_ARTIFACT_BYTES });
    try {
      const metadata = parseMetadata(upload.fields[METADATA_FIELD], createVersionRequestSchema);
      const artifact = await this.artifacts.addVersion(actor, id, metadata, {
        stream: upload.file.stream,
        filename: upload.file.filename,
      });
      return { artifact: toArtifactDto(artifact) };
    } catch (error) {
      upload.discard();
      throw error;
    }
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
    // `scope=mine` is the only scope until public visibility and shares (steps 12–14).
    const { page, pageSize } = query;
    const { items, total } = await this.artifacts.list(actor, {
      ownerId: actor.userId,
      page,
      pageSize,
    });
    return { items: items.map(toArtifactDto), page, pageSize, total };
  }

  /**
   * Streams a version's bytes with the sandbox headers (plan §7). `?download=1` saves it as a
   * file. The ETag is the content hash, so revalidation is a 304 after the access check.
   * Handles the response itself: Nest would reset a 304 to 200.
   */
  @Get(':id/versions/:no/content')
  async content(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('no') versionNo: string,
    @Query('download') download: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { artifact, version, open } = await this.artifacts.getContent(actor, id, versionNo);
    const etag = `"${version.sha256}"`;
    res.set(CONTENT_SECURITY_HEADERS).set('ETag', etag);
    if (etagMatches(req.get('If-None-Match'), etag)) {
      res.status(304).end();
      return;
    }

    const body = await open();
    res.set({
      'Content-Type': servedContentType(version.mimeType),
      'Content-Length': String(version.sizeBytes),
      'Content-Disposition':
        download === '1'
          ? attachmentDisposition(
              downloadFilename(version.originalFilename, artifact.title, version.mimeType),
            )
          : 'inline',
    });
    try {
      await pipeline(body, res);
    } catch (err) {
      // Headers are sent by now; the client sees a truncated response.
      this.logger.warn(
        { err, artifactId: artifact.id, versionNo: version.versionNo },
        'Content stream failed',
      );
    }
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
