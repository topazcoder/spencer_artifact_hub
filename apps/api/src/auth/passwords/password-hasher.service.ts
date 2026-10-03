import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id with the library defaults (m=19 MiB, t=2, p=1), which match the OWASP recommendation.
 * `verify` compares in constant time.
 */
@Injectable()
export class PasswordHasherService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return hash(password);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  /**
   * Does the same work as a real check against a throwaway hash, so a login for an unknown
   * email takes as long as one with a wrong password.
   */
  async verifyAgainstDummy(password: string): Promise<void> {
    this.dummyHash ??= hash('dummy password for timing equalization');
    await this.verify(await this.dummyHash, password);
  }
}
