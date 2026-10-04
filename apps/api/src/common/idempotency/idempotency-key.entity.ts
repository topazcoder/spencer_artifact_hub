import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../../users/user.entity.js';

/**
 * An `Idempotency-Key` a user sent, and what the request did with it. Holds no copy of the
 * response: a replay answers with the current state of `resourceId`.
 */
@Entity('idempotency_keys')
export class IdempotencyKey {
  @PrimaryColumn('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @PrimaryColumn('uuid')
  key: string;

  /** Method and path of the request, e.g. `POST /api/artifacts`. */
  @Column('text')
  route: string;

  /** Fingerprint of what was sent; set once the request has succeeded. */
  @Column({ type: 'char', length: 64, nullable: true })
  requestHash: string | null;

  /** What the request created or changed; null while it is still in progress. */
  @Column({ type: 'uuid', nullable: true })
  resourceId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
