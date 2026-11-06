import { describe, expect, it } from 'vitest';

import { parseEnv } from '.';

const base = { DATABASE_URL: 'postgres://postgres@localhost:5432/my_notebook' };

describe('parseEnv', () => {
  it('applies defaults for optional variables', () => {
    const env = parseEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.COMMIT).toBe('unknown');
    expect(env.IP_HASH_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it('treats empty strings as unset', () => {
    expect(parseEnv({ ...base, COMMIT: '' }).COMMIT).toBe('unknown');
  });

  it('accepts an optional Postgres TEST_DATABASE_URL', () => {
    const url = 'postgres://postgres@localhost:5432/my_notebook_test';
    expect(parseEnv({ ...base, TEST_DATABASE_URL: url }).TEST_DATABASE_URL).toBe(url);
    expect(() => parseEnv({ ...base, TEST_DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /TEST_DATABASE_URL/,
    );
  });

  it('rejects a missing or non-Postgres DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/);
  });

  it('requires IP_HASH_SECRET in production', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/IP_HASH_SECRET/);
    const secret = 'x'.repeat(32);
    expect(
      parseEnv({ ...base, NODE_ENV: 'production', IP_HASH_SECRET: secret }).IP_HASH_SECRET,
    ).toBe(secret);
  });

  it('rejects an unknown log level', () => {
    expect(() => parseEnv({ ...base, LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });
});
