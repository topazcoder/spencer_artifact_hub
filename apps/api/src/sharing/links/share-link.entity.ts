import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ArtifactVersion } from '../../artifacts/artifact-version.entity.js';
import { Artifact } from '../../artifacts/artifact.entity.js';

/**
 * An artifact's link for people outside the company: anyone with it can view and download
 * without signing in. At most one live (not revoked) link per artifact.
 */
@Entity('share_links')
export class ShareLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  artifactId: string;

  @ManyToOne(() => Artifact, { onDelete: 'CASCADE' })
  @JoinColumn()
  artifact: Artifact;

  /** SHA-256 of the token, to find the link from its URL. */
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  /** The token, encrypted with `SHARE_LINK_KEY`, so the owner can copy the link again. */
  @Column('text')
  tokenCiphertext: string;

  /** The only version it shows; null = all versions (following the latest). */
  @Column({ type: 'uuid', nullable: true })
  pinnedVersionId: string | null;

  @ManyToOne(() => ArtifactVersion, { nullable: true })
  @JoinColumn()
  pinnedVersion: ArtifactVersion | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  /** Set when turned off or replaced by a reset. */
  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** User id of the owner who turned it on. */
  @Column('uuid')
  createdBy: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
