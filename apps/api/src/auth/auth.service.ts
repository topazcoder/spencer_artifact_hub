import { Injectable } from '@nestjs/common';
import { ErrorCode, type LoginRequest, type SignupRequest } from '@artifact-hub/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppError } from '../common/errors/app-error.js';
import { isUniqueViolation } from '../database/postgres-errors.js';
import type { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import type { Actor, AuthResult, LoginContext } from './auth.types.js';
import { PasswordHasherService } from './passwords/password-hasher.service.js';
import { SessionsService } from './sessions/sessions.service.js';
import type { IssuedSession } from './sessions/sessions.types.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly passwords: PasswordHasherService,
    @InjectPinoLogger(AuthService.name) private readonly logger: PinoLogger,
  ) {}

  /** Creates the account and logs it in. */
  async signup(input: SignupRequest, context: LoginContext): Promise<AuthResult> {
    const passwordHash = await this.passwords.hash(input.password);
    let user: User;
    try {
      user = await this.users.create({
        email: input.email,
        passwordHash,
        displayName: input.displayName,
      });
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_key')) {
        throw new AppError(ErrorCode.CONFLICT, 'An account with this email already exists.');
      }
      throw error;
    }
    this.logger.info({ userId: user.id }, 'User signed up');
    return { user, session: await this.startSession(user, context) };
  }

  async login(input: LoginRequest, context: LoginContext): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email);
    const valid = user
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.verifyAgainstDummy(input.password).then(() => false);

    if (!user || !valid) {
      this.logger.warn(
        { userId: user?.id, reason: user ? 'wrong_password' : 'unknown_email', ip: context.ip },
        'Login failed',
      );
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'Invalid email or password.');
    }
    this.logger.info({ userId: user.id }, 'User logged in');
    return { user, session: await this.startSession(user, context) };
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.sessions.revoke(token);
  }

  async me(actor: Actor): Promise<User> {
    const user = await this.users.findById(actor.userId);
    if (!user) throw new AppError(ErrorCode.UNAUTHENTICATED, 'Please log in.');
    return user;
  }

  /** Always issues a fresh token (no session fixation) and drops the browser's previous one. */
  private async startSession(user: User, context: LoginContext): Promise<IssuedSession> {
    if (context.previousToken) await this.sessions.revoke(context.previousToken);
    return this.sessions.create(user.id, context);
  }
}
