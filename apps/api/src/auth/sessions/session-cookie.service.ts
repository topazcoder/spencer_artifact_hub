import { Injectable } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { InjectEnv } from '../../config/config.module.js';
import type { Env } from '../../config/config.types.js';

export const SESSION_COOKIE = 'ah_session';

@Injectable()
export class SessionCookieService {
  private readonly options: CookieOptions;

  constructor(@InjectEnv() env: Env) {
    this.options = { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax', path: '/' };
  }

  read(req: Request): string | undefined {
    const value: unknown = req.cookies?.[SESSION_COOKIE];
    return typeof value === 'string' && value !== '' ? value : undefined;
  }

  set(res: Response, token: string, expiresAt: Date): void {
    res.cookie(SESSION_COOKIE, token, { ...this.options, expires: expiresAt });
  }

  clear(res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.options);
  }
}
