import type { Request, Response } from 'express';
import type { DynamicModule, InjectionToken, Type } from '@nestjs/common';
import type { User } from '../users/user.entity.js';
import type { ClientInfo, IssuedSession } from './sessions/sessions.types.js';

/** Who is performing an action. Every service method that touches user data takes one. */
export interface Actor {
  userId: string;
  via: 'web' | 'mcp';
}

/** Ways a request can prove who sent it. Routes accept `session` unless they say otherwise. */
export type AuthScheme = 'session' | 'api_token';

/** How the request was authenticated: a session cookie (web) or an API token (MCP, scripts). */
export type RequestAuth =
  | { scheme: 'session'; actor: Actor; sessionId: string }
  | { scheme: 'api_token'; actor: Actor; apiTokenId: string };

declare global {
  namespace Express {
    interface Request {
      /** Set by `AuthGuard` on authenticated routes. */
      auth?: RequestAuth;
    }
  }
}

/** Checks one kind of credentials. `AuthGuard` asks the ones a route accepts, in order. */
export interface RequestAuthenticator {
  readonly scheme: AuthScheme;
  /** What a client that sent no credentials of this kind is told. */
  readonly missingCredentialsMessage: string;
  /**
   * Null when the request carries no credentials of this kind. Throws `UNAUTHENTICATED` when it
   * carries invalid ones, so a bad credential is never silently ignored.
   */
  authenticate(req: Request, res: Response): Promise<RequestAuth | null>;
}

/** `AuthModule.register` options: the authenticators beyond sessions, and their modules. */
export interface AuthModuleOptions {
  imports?: (Type | DynamicModule)[];
  authenticators?: InjectionToken<RequestAuthenticator>[];
}

export interface LoginContext extends ClientInfo {
  /** The session token the browser already holds, if any; it is revoked on login. */
  previousToken?: string;
}

export interface AuthResult {
  user: User;
  session: IssuedSession;
}
