import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateShares1791400000000 implements MigrationInterface {
  name = 'CreateShares1791400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // The version everyone at the company sees when the artifact is public; NULL = latest.
    await queryRunner.query(`
      ALTER TABLE artifacts
        ADD COLUMN public_pinned_version_id uuid REFERENCES artifact_versions (id)
    `);
    await queryRunner.query(`CREATE TYPE share_permission AS ENUM ('view', 'comment')`);
    await queryRunner.query(`
      CREATE TABLE shares (
        artifact_id uuid NOT NULL REFERENCES artifacts (id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        permission share_permission NOT NULL,
        pinned_version_id uuid REFERENCES artifact_versions (id) ON DELETE CASCADE,
        created_by uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (artifact_id, user_id)
      )
    `);
    // "Shared with me" and the access check, by user.
    await queryRunner.query('CREATE INDEX shares_user_id_idx ON shares (user_id)');
    await queryRunner.query(
      'CREATE INDEX shares_pinned_version_id_idx ON shares (pinned_version_id)',
    );
    await queryRunner.query('CREATE INDEX shares_created_by_idx ON shares (created_by)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE shares');
    await queryRunner.query('DROP TYPE share_permission');
    await queryRunner.query('ALTER TABLE artifacts DROP COLUMN public_pinned_version_id');
  }
}
