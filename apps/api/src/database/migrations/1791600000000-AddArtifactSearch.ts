import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Full-text search over artifacts (plan §3): title (weight A), tags (B), description (C) and
 * the current version's extracted text (D). Triggers keep the vector up to date: a generated
 * column can't read `artifact_versions.extracted_text`, which the extraction job fills later.
 */
export class AddArtifactSearch1791600000000 implements MigrationInterface {
  name = 'AddArtifactSearch1791600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE artifacts ADD COLUMN search_vector tsvector NOT NULL DEFAULT ''::tsvector`,
    );
    await queryRunner.query(`
      CREATE FUNCTION artifact_search_vector(title text, tags text[], description text, extracted text)
      RETURNS tsvector LANGUAGE sql IMMUTABLE AS $$
        SELECT setweight(to_tsvector('english', coalesce(title, '')), 'A')
          || setweight(to_tsvector('english', array_to_string(coalesce(tags, '{}'), ' ')), 'B')
          || setweight(to_tsvector('english', coalesce(description, '')), 'C')
          -- Bounded: to_tsvector rejects very large documents.
          || setweight(to_tsvector('english', left(coalesce(extracted, ''), 200000)), 'D')
      $$
    `);
    await queryRunner.query(`
      CREATE FUNCTION artifacts_refresh_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        NEW.search_vector := artifact_search_vector(
          NEW.title, NEW.tags, NEW.description,
          (SELECT extracted_text FROM artifact_versions WHERE id = NEW.current_version_id));
        RETURN NEW;
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER artifacts_search_vector
        BEFORE INSERT OR UPDATE OF title, tags, description, current_version_id ON artifacts
        FOR EACH ROW EXECUTE FUNCTION artifacts_refresh_search_vector()
    `);
    await queryRunner.query(`
      CREATE FUNCTION artifact_versions_refresh_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE artifacts
          SET search_vector = artifact_search_vector(title, tags, description, NEW.extracted_text)
          WHERE current_version_id = NEW.id;
        RETURN NULL;
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER artifact_versions_search_vector
        AFTER UPDATE OF extracted_text ON artifact_versions
        FOR EACH ROW EXECUTE FUNCTION artifact_versions_refresh_search_vector()
    `);
    // Existing artifacts.
    await queryRunner.query(`
      UPDATE artifacts a SET search_vector = artifact_search_vector(
        a.title, a.tags, a.description,
        (SELECT extracted_text FROM artifact_versions v WHERE v.id = a.current_version_id))
    `);
    await queryRunner.query(
      'CREATE INDEX artifacts_search_vector_idx ON artifacts USING GIN (search_vector)',
    );
    await queryRunner.query('CREATE INDEX artifacts_tags_idx ON artifacts USING GIN (tags)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX artifacts_tags_idx');
    await queryRunner.query('DROP TRIGGER artifact_versions_search_vector ON artifact_versions');
    await queryRunner.query('DROP FUNCTION artifact_versions_refresh_search_vector()');
    await queryRunner.query('DROP TRIGGER artifacts_search_vector ON artifacts');
    await queryRunner.query('DROP FUNCTION artifacts_refresh_search_vector()');
    await queryRunner.query('ALTER TABLE artifacts DROP COLUMN search_vector');
    await queryRunner.query('DROP FUNCTION artifact_search_vector(text, text[], text, text)');
  }
}
