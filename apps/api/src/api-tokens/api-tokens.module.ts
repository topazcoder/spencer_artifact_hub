import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiToken } from './api-token.entity.js';
import { ApiTokenAuthenticatorService } from './api-token-authenticator.service.js';
import { ApiTokensController } from './api-tokens.controller.js';
import { ApiTokensService } from './api-tokens.service.js';

/** API tokens and their management routes. Its authenticator is registered with `AuthModule`. */
@Module({
  imports: [TypeOrmModule.forFeature([ApiToken])],
  controllers: [ApiTokensController],
  providers: [ApiTokensService, ApiTokenAuthenticatorService],
  exports: [ApiTokenAuthenticatorService],
})
export class ApiTokensModule {}
