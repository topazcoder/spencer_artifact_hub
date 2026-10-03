import type { ArtifactMimeType, ArtifactVersion as ArtifactVersionDto } from '@artifact-hub/shared';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** One immutable piece of content. New content always means a new version. */
@Entity('artifact_versions')
export class ArtifactVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  artifactId: string;

  /** 1, 2, 3, … per artifact. */
  @Column('int')
  versionNo: number;

  /** Server-generated `StorageDriver` key. */
  @Column('text')
  storageKey: string;

  /** Decided by the server from the content, never taken from the client. */
  @Column('text')
  mimeType: ArtifactMimeType;

  @Column('int')
  sizeBytes: number;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  /** For display only; never used to build paths or keys. */
  @Column({ type: 'text', nullable: true })
  originalFilename: string | null;

  @Column({ type: 'text', nullable: true })
  changeNote: string | null;

  /** User id of the uploader. */
  @Column('uuid')
  createdBy: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

export function toArtifactVersionDto(version: ArtifactVersion): ArtifactVersionDto {
  return {
    id: version.id,
    versionNo: version.versionNo,
    mimeType: version.mimeType,
    sizeBytes: version.sizeBytes,
    sha256: version.sha256,
    originalFilename: version.originalFilename,
    changeNote: version.changeNote,
    createdAt: version.createdAt.toISOString(),
  };
}
