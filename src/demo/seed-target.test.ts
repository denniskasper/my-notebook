import { describe, expect, it } from 'vitest';

import { seedRefusal } from './seed-target';

const local = 'postgres://postgres:postgres@localhost:5432/my_notebook';

describe('seedRefusal', () => {
  it.each([
    local,
    'postgres://postgres@127.0.0.1:5432/my_notebook_test',
    'postgresql://postgres@[::1]/my_notebook',
  ])('allows a local database: %s', (databaseUrl) => {
    expect(seedRefusal({ nodeEnv: 'development', databaseUrl })).toBeNull();
  });

  it('refuses in production, even against a local database', () => {
    expect(seedRefusal({ nodeEnv: 'production', databaseUrl: local })).toMatch(/production/);
  });

  it('refuses a database on another host', () => {
    expect(
      seedRefusal({ nodeEnv: 'development', databaseUrl: 'postgres://app@db.example.org/app' }),
    ).toMatch(/db\.example\.org/);
  });
});
