import { InvalidEnvError, parseEnv } from './env.js';

const DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
const PROD = {
  NODE_ENV: 'production',
  APP_BASE_URL: 'https://hub.example.com',
  DATABASE_URL,
  STORAGE_LOCAL_ROOT: '/data/blobs',
};

describe('parseEnv', () => {
  it('applies defaults for development', () => {
    expect(parseEnv({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      APP_BASE_URL: 'http://localhost:5173',
      LOG_LEVEL: 'info',
      DATABASE_URL,
      TRUST_PROXY_HOPS: 0,
      SESSION_TTL_DAYS: 7,
      COOKIE_SECURE: false,
      RATE_LIMIT_LOGIN_PER_IP: 20,
      RATE_LIMIT_LOGIN_PER_EMAIL: 10,
      RATE_LIMIT_LOGIN_WINDOW_SECONDS: 900,
      STORAGE_DRIVER: 'local',
      STORAGE_LOCAL_ROOT: '.data/blobs',
      MAX_ARTIFACT_BYTES: 10_485_760,
    });
  });

  it('defaults COOKIE_SECURE to true in production, and lets it be overridden', () => {
    expect(parseEnv(PROD).COOKIE_SECURE).toBe(true);
    expect(parseEnv({ ...PROD, COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false);
    expect(parseEnv({ DATABASE_URL, COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true);
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

  it('requires STORAGE_LOCAL_ROOT in production when the local driver is used', () => {
    expect(() => parseEnv({ ...PROD, STORAGE_LOCAL_ROOT: undefined })).toThrow(
      /STORAGE_LOCAL_ROOT/,
    );
    expect(parseEnv(PROD).STORAGE_LOCAL_ROOT).toBe('/data/blobs');
  });

  it('rejects unknown storage drivers', () => {
    expect(() => parseEnv({ STORAGE_DRIVER: 'ftp' })).toThrow(/STORAGE_DRIVER/);
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
