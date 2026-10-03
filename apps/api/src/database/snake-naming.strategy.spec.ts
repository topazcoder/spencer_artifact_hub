import { SnakeNamingStrategy } from './snake-naming.strategy.js';

describe('SnakeNamingStrategy', () => {
  const strategy = new SnakeNamingStrategy();

  it('snake-cases tables and columns unless a name is given', () => {
    expect(strategy.tableName('ArtifactVersion', undefined)).toBe('artifact_version');
    expect(strategy.tableName('ArtifactVersion', 'artifact_versions')).toBe('artifact_versions');
    expect(strategy.columnName('latestVersionNo', '', [])).toBe('latest_version_no');
    expect(strategy.columnName('createdAt', 'created', [])).toBe('created');
  });

  it('builds snake_case join columns', () => {
    expect(strategy.joinColumnName('currentVersion', 'id')).toBe('current_version_id');
  });
});
