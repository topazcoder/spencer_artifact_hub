import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type AuthResponse,
  type LoginRequest,
  loginRequestSchema,
  type SignupRequest,
  signupRequestSchema,
} from '@artifact-hub/shared';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { LOGIN_EMAIL_THROTTLER } from '../common/rate-limit/rate-limit.module.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { toUserDto } from '../users/user.entity.js';
import { CurrentActor, Public } from './auth.decorators.js';
import { AuthService } from './auth.service.js';
import type { Actor, AuthResult, LoginContext } from './auth.types.js';
import { SessionCookieService } from './sessions/session-cookie.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookie: SessionCookieService,
  ) {}

  @Public()
  @Post('signup')
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ [LOGIN_EMAIL_THROTTLER]: true })
  async signup(
    @Body(new ZodValidationPipe(signupRequestSchema)) body: SignupRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.authResponse(res, await this.auth.signup(body, this.loginContext(req)));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.authResponse(res, await this.auth.login(body, this.loginContext(req)));
  }

  /** Public so that logging out with an expired session still clears the cookie. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(this.cookie.read(req));
    this.cookie.clear(res);
  }

  @Get('me')
  async me(@CurrentActor() actor: Actor): Promise<AuthResponse> {
    return { user: toUserDto(await this.auth.me(actor)) };
  }

  private loginContext(req: Request): LoginContext {
    return {
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      previousToken: this.cookie.read(req),
    };
  }

  private authResponse(res: Response, { user, session }: AuthResult): AuthResponse {
    this.cookie.set(res, session.token, session.expiresAt);
    return { user: toUserDto(user) };
  }
}
