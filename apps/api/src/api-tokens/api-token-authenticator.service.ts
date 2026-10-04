import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@artifact-hub/shared';
import type { Request } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { RequestAuth, RequestAuthenticator } from '../auth/auth.types.js';
import { AppError } from '../common/errors/app-error.js';
import { ApiTokensService } from './api-tokens.service.js';

const BEARER = /^Bearer\s+(\S+)\s*$/i;

/** `Authorization: Bearer ah_…`, for MCP clients and scripts. Authenticates as an MCP actor. */
@Injectable()
export class ApiTokenAuthenticatorService implements RequestAuthenticator {
  readonly scheme = 'api_token';
  readonly missingCredentialsMessage =
    'Send an API token as "Authorization: Bearer <token>". Create one in Settings → API tokens.';

  constructor(
    private readonly tokens: ApiTokensService,
    @InjectPinoLogger(ApiTokenAuthenticatorService.name) private readonly logger: PinoLogger,
  ) {}

  async authenticate(req: Request): Promise<RequestAuth | null> {
    const secret = BEARER.exec(req.get('authorization') ?? '')?.[1];
    if (secret === undefined) return null;
    const result = await this.tokens.check(secret);
    if (!result.ok) {
      this.logger.warn(
        { reason: result.reason, tokenId: result.tokenId, ip: req.ip },
        'API token rejected',
      );
      throw new AppError(
        ErrorCode.UNAUTHENTICATED,
        'This API token is not valid or was revoked. Create a new one in Settings → API tokens.',
      );
    }
    const { token } = result;
    return {
      scheme: 'api_token',
      actor: { userId: token.userId, via: 'mcp' },
      apiTokenId: token.id,
    };
  }
}
