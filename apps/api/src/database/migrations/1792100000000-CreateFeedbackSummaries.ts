import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFeedbackSummaries1792100000000 implements MigrationInterface {
  name = 'CreateFeedbackSummaries1792100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // One summary per artifact and set of versions; summarizing again replaces it. An empty
    // version_ids means every version.
    await queryRunner.query(`
      CREATE TABLE feedback_summaries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        artifact_id uuid NOT NULL REFERENCES artifacts (id) ON DELETE CASCADE,
        version_ids uuid[] NOT NULL,
        summary jsonb NOT NULL,
        input_hash char(64) NOT NULL,
        comment_count integer NOT NULL,
        partial boolean NOT NULL,
        model text NOT NULL,
        generated_at timestamptz NOT NULL
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX feedback_summaries_artifact_versions_key ON feedback_summaries (artifact_id, version_ids)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE feedback_summaries');
  }
}
