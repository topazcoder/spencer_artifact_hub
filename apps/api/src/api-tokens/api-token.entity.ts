import type { ApiToken as ApiTokenDto } from '@artifact-hub/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity.js';

/** A personal access token for MCP clients and scripts (`Authorization: Bearer ah_…`). */
@Entity('api_tokens')
export class ApiToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column('text')
  name: string;

  /** The token's first characters, shown in the list to tell tokens apart. */
  @Column('text')
  tokenPrefix: string;

  /** SHA-256 (hex) of the token; the token itself is never stored. */
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

export function toApiTokenDto(token: ApiToken): ApiTokenDto {
  return {
    id: token.id,
    name: token.name,
    prefix: token.tokenPrefix,
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    createdAt: token.createdAt.toISOString(),
  };
}
