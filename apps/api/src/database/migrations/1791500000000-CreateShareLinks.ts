import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateShareLinks1791500000000 implements MigrationInterface {
  name = 'CreateShareLinks1791500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE share_links (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        artifact_id uuid NOT NULL REFERENCES artifacts (id) ON DELETE CASCADE,
        token_hash char(64) NOT NULL,
        token_ciphertext text NOT NULL,
        pinned_version_id uuid REFERENCES artifact_versions (id) ON DELETE CASCADE,
        expires_at timestamptz,
        revoked_at timestamptz,
        created_by uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT share_links_token_hash_key UNIQUE (token_hash)
      )
    `);
    // One live link per artifact; turned-off and reset links stay as history.
    await queryRunner.query(`
      CREATE UNIQUE INDEX share_links_live_artifact_id_key
        ON share_links (artifact_id) WHERE revoked_at IS NULL
    `);
    await queryRunner.query(
      'CREATE INDEX share_links_pinned_version_id_idx ON share_links (pinned_version_id)',
    );
    await queryRunner.query('CREATE INDEX share_links_created_by_idx ON share_links (created_by)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE share_links');
  }
}
