import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdempotencyKeys1792000000000 implements MigrationInterface {
  name = 'CreateIdempotencyKeys1792000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE idempotency_keys (
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        key uuid NOT NULL,
        route text NOT NULL,
        request_hash char(64),
        resource_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, key)
      )
    `);
    // For the sweeper that prunes keys after a day.
    await queryRunner.query(
      'CREATE INDEX idempotency_keys_created_at_idx ON idempotency_keys (created_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE idempotency_keys');
  }
}
