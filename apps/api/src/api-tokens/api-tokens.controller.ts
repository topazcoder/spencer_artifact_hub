import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  type ApiTokenListResponse,
  type CreateApiTokenRequest,
  type CreateApiTokenResponse,
  createApiTokenRequestSchema,
} from '@artifact-hub/shared';
import { CurrentActor } from '../auth/auth.decorators.js';
import type { Actor } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { toApiTokenDto } from './api-token.entity.js';
import { ApiTokensService } from './api-tokens.service.js';

/** The signed-in user's API tokens. Session only: a token can't create or revoke tokens. */
@Controller('tokens')
export class ApiTokensController {
  constructor(private readonly tokens: ApiTokensService) {}

  @Get()
  async list(@CurrentActor() actor: Actor): Promise<ApiTokenListResponse> {
    return { items: (await this.tokens.list(actor)).map(toApiTokenDto) };
  }

  /** The response carries the full token, which is never shown again. */
  @Post()
  async create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createApiTokenRequestSchema)) { name }: CreateApiTokenRequest,
  ): Promise<CreateApiTokenResponse> {
    const { token, secret } = await this.tokens.create(actor, name);
    return { token: toApiTokenDto(token), secret };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@CurrentActor() actor: Actor, @Param('id') tokenId: string): Promise<void> {
    await this.tokens.revoke(actor, tokenId);
  }
}
