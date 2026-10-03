import type { Session } from './session.entity.js';

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

export interface ResolvedSession {
  /** Includes `user`. */
  session: Session;
  /** True when the expiry was extended, so the cookie must be re-sent with the new expiry. */
  extended: boolean;
}
