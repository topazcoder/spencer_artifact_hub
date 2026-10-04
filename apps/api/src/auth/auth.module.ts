import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard, REQUEST_AUTHENTICATORS } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import type { AuthModuleOptions, RequestAuthenticator } from './auth.types.js';
import { CsrfGuard } from './csrf/csrf.guard.js';
import { PasswordHasherService } from './passwords/password-hasher.service.js';
import { SessionAuthenticatorService } from './sessions/session-authenticator.service.js';
import { SessionCookieService } from './sessions/session-cookie.service.js';
import { Session } from './sessions/session.entity.js';
import { SessionsService } from './sessions/sessions.service.js';

@Module({})
export class AuthModule {
  /**
   * Sessions are built in; other credentials (API tokens, …) are added here, with the modules
   * that provide their authenticators, so this module never depends on them.
   */
  static register({ imports = [], authenticators = [] }: AuthModuleOptions = {}): DynamicModule {
    const all = [SessionAuthenticatorService, ...authenticators];
    return {
      module: AuthModule,
      imports: [TypeOrmModule.forFeature([Session]), UsersModule, ...imports],
      controllers: [AuthController],
      providers: [
        AuthService,
        SessionsService,
        SessionCookieService,
        SessionAuthenticatorService,
        PasswordHasherService,
        {
          provide: REQUEST_AUTHENTICATORS,
          useFactory: (...instances: RequestAuthenticator[]) => instances,
          inject: all,
        },
        // Global guards run in this order: CSRF first, then authentication.
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    };
  }
}
