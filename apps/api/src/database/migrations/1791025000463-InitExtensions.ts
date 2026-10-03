import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitExtensions1791025000463 implements MigrationInterface {
  name = 'InitExtensions1791025000463';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Case-insensitive text, used for user emails.
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS citext');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS citext');
  }
}
