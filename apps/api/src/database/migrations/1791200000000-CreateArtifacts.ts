import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateArtifacts1791200000000 implements MigrationInterface {
  name = 'CreateArtifacts1791200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE artifact_visibility AS ENUM ('private', 'public')`);
    await queryRunner.query(`CREATE TYPE artifact_status AS ENUM ('draft', 'published')`);
    await queryRunner.query(`CREATE TYPE metadata_source AS ENUM ('user', 'ai', 'mixed')`);
    await queryRunner.query(`
      CREATE TABLE artifacts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        title text NOT NULL,
        description text NOT NULL DEFAULT '',
        tags text[] NOT NULL DEFAULT '{}',
        visibility artifact_visibility NOT NULL DEFAULT 'private',
        current_version_id uuid,
        latest_version_no integer NOT NULL DEFAULT 0,
        status artifact_status NOT NULL DEFAULT 'draft',
        metadata_source metadata_source NOT NULL DEFAULT 'user',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT artifacts_published_has_version
          CHECK (status = 'draft' OR current_version_id IS NOT NULL)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE artifact_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        artifact_id uuid NOT NULL REFERENCES artifacts (id) ON DELETE CASCADE,
        version_no integer NOT NULL CHECK (version_no > 0),
        storage_key text NOT NULL,
        mime_type text NOT NULL,
        size_bytes integer NOT NULL CHECK (size_bytes >= 0),
        sha256 char(64) NOT NULL,
        original_filename text,
        change_note text,
        extracted_text text,
        created_by uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT artifact_versions_artifact_id_version_no_key UNIQUE (artifact_id, version_no),
        CONSTRAINT artifact_versions_storage_key_key UNIQUE (storage_key)
      )
    `);
    await queryRunner.query(`
      ALTER TABLE artifacts
        ADD CONSTRAINT artifacts_current_version_id_fkey
        FOREIGN KEY (current_version_id) REFERENCES artifact_versions (id)
    `);
    // "Mine", newest first.
    await queryRunner.query(`
      CREATE INDEX artifacts_owner_id_updated_at_idx
        ON artifacts (owner_id, updated_at DESC, id DESC) WHERE deleted_at IS NULL
    `);
    await queryRunner.query(
      'CREATE INDEX artifact_versions_created_by_idx ON artifact_versions (created_by)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE artifacts DROP CONSTRAINT artifacts_current_version_id_fkey',
    );
    await queryRunner.query('DROP TABLE artifact_versions');
    await queryRunner.query('DROP TABLE artifacts');
    await queryRunner.query('DROP TYPE metadata_source');
    await queryRunner.query('DROP TYPE artifact_status');
    await queryRunner.query('DROP TYPE artifact_visibility');
  }
}
