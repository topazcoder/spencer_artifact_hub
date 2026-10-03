import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateComments1791700000000 implements MigrationInterface {
  name = 'CreateComments1791700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Replies are one level deep and on their comment's version; the service checks both,
    // since a CHECK constraint can't look at the parent row.
    await queryRunner.query(`
      CREATE TABLE comments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        artifact_id uuid NOT NULL REFERENCES artifacts (id) ON DELETE CASCADE,
        version_id uuid NOT NULL REFERENCES artifact_versions (id) ON DELETE CASCADE,
        parent_id uuid REFERENCES comments (id) ON DELETE CASCADE,
        author_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
        anchor jsonb,
        resolved_at timestamptz,
        resolved_by uuid REFERENCES users (id) ON DELETE SET NULL,
        edited_at timestamptz,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT comments_only_top_level_resolved
          CHECK (parent_id IS NULL OR resolved_at IS NULL),
        CONSTRAINT comments_not_own_parent CHECK (parent_id <> id)
      )
    `);
    // An artifact's threads, oldest first.
    await queryRunner.query(`
      CREATE INDEX comments_artifact_id_created_at_idx
        ON comments (artifact_id, created_at, id) WHERE deleted_at IS NULL
    `);
    await queryRunner.query('CREATE INDEX comments_version_id_idx ON comments (version_id)');
    await queryRunner.query('CREATE INDEX comments_parent_id_idx ON comments (parent_id)');
    await queryRunner.query('CREATE INDEX comments_author_id_idx ON comments (author_id)');
    await queryRunner.query('CREATE INDEX comments_resolved_by_idx ON comments (resolved_by)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE comments');
  }
}
