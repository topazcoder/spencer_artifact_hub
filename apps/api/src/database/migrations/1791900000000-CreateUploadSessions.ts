import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUploadSessions1791900000000 implements MigrationInterface {
  name = 'CreateUploadSessions1791900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE upload_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        token_hash char(64) NOT NULL,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        artifact_id uuid NOT NULL REFERENCES artifacts (id) ON DELETE CASCADE,
        purpose text NOT NULL CHECK (purpose IN ('create', 'new_version')),
        change_note text,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz,
        resulting_version_id uuid REFERENCES artifact_versions (id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT upload_sessions_token_hash_key UNIQUE (token_hash)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX upload_sessions_user_id_idx ON upload_sessions (user_id)',
    );
    await queryRunner.query(
      'CREATE INDEX upload_sessions_artifact_id_idx ON upload_sessions (artifact_id)',
    );
    // For the sweeper that prunes expired sessions.
    await queryRunner.query(
      'CREATE INDEX upload_sessions_expires_at_idx ON upload_sessions (expires_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE upload_sessions');
  }
}
