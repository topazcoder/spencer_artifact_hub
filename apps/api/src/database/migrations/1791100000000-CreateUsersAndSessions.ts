import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersAndSessions1791100000000 implements MigrationInterface {
  name = 'CreateUsersAndSessions1791100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email citext NOT NULL,
        password_hash text NOT NULL,
        display_name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT users_email_key UNIQUE (email)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        token_hash char(64) NOT NULL,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL,
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        ip inet,
        user_agent text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT sessions_token_hash_key UNIQUE (token_hash)
      )
    `);
    await queryRunner.query('CREATE INDEX sessions_user_id_idx ON sessions (user_id)');
    // For the sweeper that prunes expired sessions.
    await queryRunner.query('CREATE INDEX sessions_expires_at_idx ON sessions (expires_at)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE sessions');
    await queryRunner.query('DROP TABLE users');
  }
}
