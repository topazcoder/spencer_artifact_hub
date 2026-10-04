import { Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import { type ArtifactResponse, ErrorCode, type UploadSessionResponse } from '@artifact-hub/shared';
import type { Request } from 'express';
import { toArtifactDto } from '../../artifacts/artifact.entity.js';
import { Auth, CurrentActor } from '../../auth/auth.decorators.js';
import type { Actor } from '../../auth/auth.types.js';
import { AppError } from '../../common/errors/app-error.js';
import { InjectEnv } from '../../config/config.module.js';
import type { Env } from '../../config/config.types.js';
import { ByteMeter } from '../content/byte-meter.js';
import { drainRequest } from '../drain-request.js';
import { readMultipartUpload } from '../multipart/read-multipart-upload.js';
import { UploadSessionsService } from './upload-sessions.service.js';

/** Optional display name of a raw upload; its extension also tells Markdown from other text. */
const FILENAME_HEADER = 'x-filename';

/**
 * Finishing an upload an MCP client asked for. The upload page uses `GET` and `POST` with the
 * session cookie; agents with a shell `PUT` the raw file with their API token. Either way the
 * caller must own the session.
 */
@Controller('upload-sessions/:token')
export class UploadSessionsController {
  constructor(
    private readonly sessions: UploadSessionsService,
    @InjectEnv() private readonly env: Env,
  ) {}

  @Get()
  async describe(
    @CurrentActor() actor: Actor,
    @Param('token') token: string,
  ): Promise<UploadSessionResponse> {
    return { session: await this.sessions.describe(actor, token) };
  }

  /** Multipart with a `file` part, from the upload page. */
  @Post()
  async uploadForm(
    @CurrentActor() actor: Actor,
    @Param('token') token: string,
    @Req() req: Request,
  ): Promise<ArtifactResponse> {
    const upload = await readMultipartUpload(req, { maxFileBytes: this.env.MAX_ARTIFACT_BYTES });
    try {
      const view = await this.sessions.complete(actor, token, {
        stream: upload.file.stream,
        filename: upload.file.filename,
      });
      return { artifact: toArtifactDto(view) };
    } catch (error) {
      await upload.discard();
      throw error;
    }
  }

  /** The file as the raw body (`curl -T file`), with `X-Filename` for its name. */
  @Put()
  @Auth('api_token')
  async uploadRaw(
    @CurrentActor() actor: Actor,
    @Param('token') token: string,
    @Req() req: Request,
  ): Promise<ArtifactResponse> {
    try {
      if (req.readableEnded) {
        // A body parser read it: it was sent as JSON or a form, not as the file itself.
        throw new AppError(
          ErrorCode.BAD_REQUEST,
          'Send the file itself as the request body, e.g. curl -T <file>.',
        );
      }
      if (Number(req.get('content-length')) > this.env.MAX_ARTIFACT_BYTES) {
        throw ByteMeter.tooLarge(this.env.MAX_ARTIFACT_BYTES);
      }
      const view = await this.sessions.complete(actor, token, {
        stream: req,
        filename: req.get(FILENAME_HEADER),
      });
      return { artifact: toArtifactDto(view) };
    } catch (error) {
      // Answer only once the rest has arrived, so the error reaches clients behind proxies.
      await drainRequest(req, this.env.MAX_ARTIFACT_BYTES);
      throw error;
    }
  }
}
