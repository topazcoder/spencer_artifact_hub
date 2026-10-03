import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import {
  type ArtifactListQuery,
  type ArtifactListResponse,
  type ArtifactResponse,
  type CreateArtifactMetadata,
  ErrorCode,
  artifactListQuerySchema,
  createArtifactRequestSchema,
} from '@artifact-hub/shared';
import type { Request } from 'express';
import { CurrentActor } from '../auth/auth.decorators.js';
import type { Actor } from '../auth/auth.types.js';
import { AppError } from '../common/errors/app-error.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { InjectEnv } from '../config/config.module.js';
import type { Env } from '../config/config.types.js';
import { readMultipartUpload } from '../uploads/multipart/read-multipart-upload.js';
import { toArtifactDto } from './artifact.entity.js';
import { ArtifactsService } from './artifacts.service.js';

/** The multipart field with the JSON metadata; it must come before the `file` field. */
const METADATA_FIELD = 'metadata';

@Controller('artifacts')
export class ArtifactsController {
  constructor(
    private readonly artifacts: ArtifactsService,
    @InjectEnv() private readonly env: Env,
  ) {}

  /** Multipart: a `metadata` JSON field (`CreateArtifactRequest`), then the `file`. */
  @Post()
  async create(@CurrentActor() actor: Actor, @Req() req: Request): Promise<ArtifactResponse> {
    const upload = await readMultipartUpload(req, { maxFileBytes: this.env.MAX_ARTIFACT_BYTES });
    try {
      const metadata = parseMetadata(upload.fields[METADATA_FIELD]);
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

  @Get(':id')
  async get(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<ArtifactResponse> {
    return { artifact: toArtifactDto(await this.artifacts.get(actor, id)) };
  }
}

function parseMetadata(raw: string | undefined): CreateArtifactMetadata {
  let value: unknown;
  try {
    value = JSON.parse(raw ?? '');
  } catch {
    throw new AppError(
      ErrorCode.VALIDATION_FAILED,
      `Send the artifact details as JSON in a "${METADATA_FIELD}" field before the file.`,
    );
  }
  return createArtifactRequestSchema.parse(value);
}
