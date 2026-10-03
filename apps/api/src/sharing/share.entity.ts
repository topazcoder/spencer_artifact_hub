import { SHARE_PERMISSIONS, type SharedPerson, type SharePermission } from '@artifact-hub/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ArtifactVersion } from '../artifacts/artifact-version.entity.js';
import { User } from '../users/user.entity.js';

/** A colleague's access to an artifact. Removing someone deletes the row. */
@Entity('shares')
export class Share {
  @PrimaryColumn('uuid')
  artifactId: string;

  @PrimaryColumn('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column({ type: 'enum', enum: SHARE_PERMISSIONS, enumName: 'share_permission' })
  permission: SharePermission;

  /** The only version they see through this share; null = always the latest. */
  @Column({ type: 'uuid', nullable: true })
  pinnedVersionId: string | null;

  @ManyToOne(() => ArtifactVersion, { nullable: true })
  @JoinColumn()
  pinnedVersion: ArtifactVersion | null;

  /** User id of the owner who shared it. */
  @Column('uuid')
  createdBy: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** Requires `user`, and `pinnedVersion` when pinned, to be loaded. */
export function toSharedPersonDto(share: Share): SharedPerson {
  return {
    user: { id: share.user.id, displayName: share.user.displayName, email: share.user.email },
    permission: share.permission,
    pinnedVersionNo: share.pinnedVersion?.versionNo ?? null,
    sharedAt: share.createdAt.toISOString(),
  };
}
