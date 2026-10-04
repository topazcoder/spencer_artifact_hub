import type { UploadSessionPurpose } from '@artifact-hub/shared';
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
import { User } from '../../users/user.entity.js';

/**
 * A one-time upload an MCP client asked for, for a file it can't send inline (images, PDFs).
 * The token is in the upload URL; the uploader must also be signed in as `userId`.
 */
@Entity('upload_sessions')
export class UploadSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** SHA-256 (hex) of the token; the token itself is never stored. */
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column('uuid')
  artifactId: string;

  @ManyToOne(() => Artifact, { onDelete: 'CASCADE' })
  @JoinColumn()
  artifact: Artifact;

  @Column('text')
  purpose: UploadSessionPurpose;

  /** For the new version. */
  @Column({ type: 'text', nullable: true })
  changeNote: string | null;

  @Column('timestamptz')
  expiresAt: Date;

  /** Set while an upload is in progress, and after it succeeded. Cleared if it failed. */
  @Column({ type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  /** The version the upload created; a repeat upload returns it. */
  @Column({ type: 'uuid', nullable: true })
  resultingVersionId: string | null;

  @ManyToOne(() => ArtifactVersion, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  resultingVersion: ArtifactVersion | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
