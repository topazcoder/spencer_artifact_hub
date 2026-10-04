import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateApiTokens1791800000000 implements MigrationInterface {
  name = 'CreateApiTokens1791800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE api_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
        token_prefix text NOT NULL,
        token_hash char(64) NOT NULL,
        last_used_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT api_tokens_token_hash_key UNIQUE (token_hash)
      )
    `);
    await queryRunner.query('CREATE INDEX api_tokens_user_id_idx ON api_tokens (user_id)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE api_tokens');
  }
}
