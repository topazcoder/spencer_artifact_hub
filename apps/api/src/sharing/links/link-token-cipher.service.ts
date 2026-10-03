import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectEnv } from '../../config/config.module.js';
import type { Env } from '../../config/config.types.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
/** Format version, so the scheme or key can change later. */
const VERSION = 'v1';

/**
 * Encrypts share link tokens with `SHARE_LINK_KEY` (AES-256-GCM), so owners can copy their
 * links again while the database alone reveals none. Sealed tokens look like
 * `v1.<iv>.<tag>.<ciphertext>`, each part base64url.
 */
@Injectable()
export class LinkTokenCipherService {
  private readonly key: Buffer;

  constructor(@InjectEnv() env: Env) {
    this.key = Buffer.from(env.SHARE_LINK_KEY, 'base64');
  }

  seal(token: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), ciphertext]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join('.');
  }

  /** Throws if `sealed` was altered or sealed with another key. */
  open(sealed: string): string {
    const [version, iv, tag, ciphertext] = sealed.split('.');
    if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
      throw new Error('Unrecognized sealed token');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
