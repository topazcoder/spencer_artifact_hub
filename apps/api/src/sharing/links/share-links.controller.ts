import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import type { SharedArtifactResponse } from '@artifact-hub/shared';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { toArtifactVersionDto } from '../../artifacts/artifact-version.entity.js';
import { sendVersionContent } from '../../artifacts/content/send-version-content.js';
import { Public } from '../../auth/auth.decorators.js';
import { SHARE_LINK_THROTTLER, UseThrottlers } from '../../common/rate-limit/rate-limit.module.js';
import { ShareLinksService } from './share-links.service.js';

/** Keeps shared pages out of search engines and their URLs out of `Referer` headers. */
const LINK_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
};

/**
 * What a share link shows, to anyone holding it: no sign-in, view and download only
 * (plan §1, S6). Rate limited per client IP.
 */
@Public()
@Controller('s/:token')
@UseThrottlers(SHARE_LINK_THROTTLER)
export class ShareLinksController {
  constructor(
    private readonly links: ShareLinksService,
    @InjectPinoLogger(ShareLinksController.name) private readonly logger: PinoLogger,
  ) {}

  @Get()
  async get(
    @Param('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SharedArtifactResponse> {
    const { link, artifact, version } = await this.links.open(token);
    res.set({ ...LINK_HEADERS, 'Cache-Control': 'no-store' });
    this.logger.info(
      { linkId: link.id, artifactId: artifact.id, versionNo: version.versionNo },
      'Share link opened',
    );
    return {
      artifact: {
        id: artifact.id,
        title: artifact.title,
        description: artifact.description,
        owner: { displayName: artifact.owner.displayName },
        version: toArtifactVersionDto(version),
      },
      expiresAt: link.expiresAt?.toISOString() ?? null,
    };
  }

  /** The shared version's bytes, with the same sandbox headers as in the app. */
  @Get('content')
  async content(
    @Param('token') token: string,
    @Query('download') download: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const content = await this.links.open(token);
    await sendVersionContent(req, res, content, {
      download: download === '1',
      headers: LINK_HEADERS,
      logger: this.logger,
    });
  }
}
