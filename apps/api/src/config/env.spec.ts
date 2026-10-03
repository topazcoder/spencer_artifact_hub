import { InvalidEnvError, parseEnv } from './env.js';

describe('parseEnv', () => {
  it('applies defaults for development', () => {
    expect(parseEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      APP_BASE_URL: 'http://localhost:5173',
      LOG_LEVEL: 'info',
    });
  });

  it('coerces numbers and strips the trailing slash from APP_BASE_URL', () => {
    const env = parseEnv({ PORT: '8080', APP_BASE_URL: 'https://hub.example.com/' });
    expect(env.PORT).toBe(8080);
    expect(env.APP_BASE_URL).toBe('https://hub.example.com');
  });

  it('treats empty strings as unset', () => {
    expect(parseEnv({ PORT: '', LOG_LEVEL: '' })).toMatchObject({ PORT: 3000, LOG_LEVEL: 'info' });
  });

  it('requires APP_BASE_URL in production', () => {
    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(/APP_BASE_URL/);
  });

  it('reports every invalid variable at once', () => {
    try {
      parseEnv({ PORT: 'abc', LOG_LEVEL: 'loud', APP_BASE_URL: 'ftp://x' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEnvError);
      const message = (error as Error).message;
      expect(message).toContain('PORT');
      expect(message).toContain('LOG_LEVEL');
      expect(message).toContain('APP_BASE_URL');
    }
  });
});
