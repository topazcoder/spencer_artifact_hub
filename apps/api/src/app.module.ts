import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ApiTokenAuthenticatorService } from './api-tokens/api-token-authenticator.service.js';
import { ApiTokensModule } from './api-tokens/api-tokens.module.js';
import { ArtifactsModule } from './artifacts/artifacts.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ClientConfigModule } from './client-config/client-config.module.js';
import { CommentsModule } from './comments/comments.module.js';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { buildLoggerParams } from './common/logging/logger.config.js';
import { RateLimitModule } from './common/rate-limit/rate-limit.module.js';
import { ConfigModule } from './config/config.module.js';
import type { Env } from './config/config.types.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { McpModule } from './mcp/mcp.module.js';
import { SharingModule } from './sharing/sharing.module.js';
import { SweeperModule } from './sweeper/sweeper.module.js';
import { UploadSessionsModule } from './uploads/sessions/upload-sessions.module.js';
import { WebModule } from './web/web.module.js';

@Module({})
export class AppModule {
  static register(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        LoggerModule.forRoot(buildLoggerParams(env)),
        DatabaseModule,
        RateLimitModule,
        AuthModule.register({
          imports: [ApiTokensModule],
          authenticators: [ApiTokenAuthenticatorService],
        }),
        ApiTokensModule,
        ArtifactsModule,
        SharingModule,
        CommentsModule,
        UploadSessionsModule,
        McpModule,
        SweeperModule,
        ClientConfigModule,
        HealthModule,
        WebModule.register(env.WEB_DIST_DIR),
      ],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    };
  }
}
