import type { User as UserDto } from '@artifact-hub/shared';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('citext')
  email: string;

  @Column('text')
  passwordHash: string;

  @Column('text')
  displayName: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  };
}
