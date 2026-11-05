import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDb } from '@/platform/db';
import { resetDatabase } from '@/test/database';

import { createVisitor, findVisitor, resolveVisitor, touchVisitor } from './store';

beforeEach(resetDatabase);
afterAll(closeDb);

describe('createVisitor', () => {
  it('stores a Visitor with a uuidv7 id and the IP hash', async () => {
    const id = await createVisitor({ ipHash: 'hash' });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    const visitor = await findVisitor(id);
    expect(visitor).toMatchObject({ id, createdIpHash: 'hash' });
    expect(visitor?.lastSeenAt).toBeInstanceOf(Date);
  });
});

describe('touchVisitor', () => {
  it('moves last_seen_at forward', async () => {
    const id = await createVisitor({ ipHash: null });
    const before = await findVisitor(id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await touchVisitor(id)).toBe(true);
    const after = await findVisitor(id);
    expect(after?.lastSeenAt.getTime()).toBeGreaterThan(before?.lastSeenAt.getTime() ?? Infinity);
  });

  it('reports a missing Visitor', async () => {
    expect(await touchVisitor('019a5a1e-7c2b-7d4e-9f00-123456789abc')).toBe(false);
  });
});

describe('resolveVisitor', () => {
  it('reuses the Visitor from a valid cookie', async () => {
    const id = await createVisitor({ ipHash: null });
    expect(await resolveVisitor({ cookieValue: id, ipHash: 'other' })).toEqual({
      visitorId: id,
      created: false,
    });
  });

  it.each([
    ['no cookie', undefined],
    ['a malformed cookie', 'garbage'],
    ['a cookie of a deleted Visitor', '019a5a1e-7c2b-7d4e-9f00-123456789abc'],
  ])('creates a new Visitor for %s', async (_case, cookieValue) => {
    const result = await resolveVisitor({ cookieValue, ipHash: 'hash' });
    expect(result.created).toBe(true);
    expect(result.visitorId).not.toBe(cookieValue);
    expect(await findVisitor(result.visitorId)).toMatchObject({ createdIpHash: 'hash' });
  });
});
