import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, type Repository } from 'typeorm';
import type { Actor } from '../auth/auth.types.js';
import { escapeLike } from '../database/escape-like.js';
import { User } from './user.entity.js';

const USER_SEARCH_LIMIT = 5;

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email });
  }

  /**
   * Up to `limit` other users whose email or display name starts with `prefix` (any case), for
   * picking people to share with. Prefix-only and capped, so it can't list every account.
   */
  search(actor: Actor, prefix: string, limit = USER_SEARCH_LIMIT): Promise<User[]> {
    const pattern = `%${escapeLike(prefix)}%`;
    return this.users
      .createQueryBuilder('user')
      .where('user.id != :me', { me: actor.userId })
      .andWhere(
        new Brackets((match) =>
          match
            .where('user.email ILIKE :pattern', { pattern })
            .orWhere('user.displayName ILIKE :pattern', { pattern }),
        ),
      )
      .orderBy('user.displayName', 'ASC')
      .addOrderBy('user.email', 'ASC')
      .limit(limit)
      .getMany();
  }

  /** Inserts a user. Throws the database's unique violation if the email is taken. */
  create(data: Pick<User, 'email' | 'passwordHash' | 'displayName'>): Promise<User> {
    return this.users.save(this.users.create(data));
  }
}
