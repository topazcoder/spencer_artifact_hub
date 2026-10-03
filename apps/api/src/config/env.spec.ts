import { InvalidEnvError, parseEnv } from './env.js';

const DATABASE_URL = 'postgres://user:pass@localhost:5432/db';

describe('parseEnv', () => {
  it('applies defaults for development', () => {
    expect(parseEnv({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      APP_BASE_URL: 'http://localhost:5173',
      LOG_LEVEL: 'info',
      DATABASE_URL,
    });
  });

  it('coerces numbers and strips the trailing slash from APP_BASE_URL', () => {
    const env = parseEnv({ DATABASE_URL, PORT: '8080', APP_BASE_URL: 'https://hub.example.com/' });
    expect(env.PORT).toBe(8080);
    expect(env.APP_BASE_URL).toBe('https://hub.example.com');
  });

  it('treats empty strings as unset', () => {
    expect(parseEnv({ DATABASE_URL, PORT: '', LOG_LEVEL: '' })).toMatchObject({
      PORT: 3000,
      LOG_LEVEL: 'info',
    });
  });

  it('defaults DATABASE_URL to the docker-compose database outside production', () => {
    expect(parseEnv({}).DATABASE_URL).toBe(
      'postgres://artifact_hub:artifact_hub@localhost:5432/artifact_hub',
    );
  });

  it('requires APP_BASE_URL and DATABASE_URL in production', () => {
    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(/APP_BASE_URL[\s\S]*DATABASE_URL/);
  });

  it('reports every invalid variable at once', () => {
    try {
      parseEnv({
        PORT: 'abc',
        LOG_LEVEL: 'loud',
        APP_BASE_URL: 'ftp://x',
        DATABASE_URL: 'mysql://x',
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEnvError);
      const message = (error as Error).message;
      expect(message).toContain('PORT');
      expect(message).toContain('LOG_LEVEL');
      expect(message).toContain('APP_BASE_URL');
      expect(message).toContain('DATABASE_URL');
    }
  });
});
