import type { MigrationInterface, QueryRunner } from 'typeorm';

export class IndexPublicArtifacts1791300000000 implements MigrationInterface {
  name = 'IndexPublicArtifacts1791300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // "All public", newest first.
    await queryRunner.query(`
      CREATE INDEX artifacts_public_updated_at_idx
        ON artifacts (updated_at DESC, id DESC)
        WHERE deleted_at IS NULL AND visibility = 'public' AND status = 'published'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX artifacts_public_updated_at_idx');
  }
}
