import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email });
  }

  /** Inserts a user. Throws the database's unique violation if the email is taken. */
  create(data: Pick<User, 'email' | 'passwordHash' | 'displayName'>): Promise<User> {
    return this.users.save(this.users.create(data));
  }
}
