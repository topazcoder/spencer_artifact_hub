import type { User } from '../users/user.entity.js';
import type { ClientInfo, IssuedSession } from './sessions/sessions.types.js';

/** Who is performing an action. Every service method that touches user data takes one. */
export interface Actor {
  userId: string;
  via: 'web' | 'mcp';
}

export interface RequestAuth {
  actor: Actor;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by `SessionGuard` on authenticated routes. */
      auth?: RequestAuth;
    }
  }
}

export interface LoginContext extends ClientInfo {
  /** The session token the browser already holds, if any; it is revoked on login. */
  previousToken?: string;
}

export interface AuthResult {
  user: User;
  session: IssuedSession;
}
