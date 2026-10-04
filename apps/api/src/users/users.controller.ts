import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ErrorCode,
  type UserResponse,
  type UserSearchQuery,
  type UserSearchResponse,
  userSearchQuerySchema,
} from '@artifact-hub/shared';
import { z } from 'zod';
import { AppError } from '../common/errors/app-error.js';
import { CurrentActor } from '../auth/auth.decorators.js';
import type { Actor } from '../auth/auth.types.js';
import { USER_SEARCH_THROTTLER, UseThrottlers } from '../common/rate-limit/rate-limit.module.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Autocomplete for the share dialog. Rate limited per user (plan S19). */
  @Get('search')
  @UseThrottlers(USER_SEARCH_THROTTLER)
  async search(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(userSearchQuerySchema)) { q }: UserSearchQuery,
  ): Promise<UserSearchResponse> {
    const users = await this.users.search(actor, q);
    return {
      items: users.map((user) => ({
        id: user.id,
        displayName: user.displayName,
        email: user.email,
      })),
    };
  }

  /** One user, to show who an id in a gallery filter stands for. Declared after `search`. */
  @Get(':id')
  @UseThrottlers(USER_SEARCH_THROTTLER)
  async get(@Param('id') id: string): Promise<UserResponse> {
    const user = z.guid().safeParse(id).success ? await this.users.findById(id) : null;
    if (!user) throw new AppError(ErrorCode.NOT_FOUND, 'User not found.');
    return { user: { id: user.id, displayName: user.displayName, email: user.email } };
  }
}
