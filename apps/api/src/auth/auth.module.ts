import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CsrfGuard } from './csrf/csrf.guard.js';
import { PasswordHasherService } from './passwords/password-hasher.service.js';
import { SessionCookieService } from './sessions/session-cookie.service.js';
import { Session } from './sessions/session.entity.js';
import { SessionGuard } from './sessions/session.guard.js';
import { SessionsService } from './sessions/sessions.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Session]), UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionsService,
    SessionCookieService,
    PasswordHasherService,
    // Global guards run in this order: CSRF first, then authentication.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AuthModule {}
