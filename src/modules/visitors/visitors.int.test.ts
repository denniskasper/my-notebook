import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, db } from '@/platform/db';
import { resetDatabase } from '@/test/database';

import { visitors } from './schema';
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
  it('moves last_seen_at forward once it is over an hour old', async () => {
    const id = await createVisitor({ ipHash: null });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await db().update(visitors).set({ lastSeenAt: twoHoursAgo }).where(eq(visitors.id, id));

    expect(await touchVisitor(id)).toBe(true);
    const after = await findVisitor(id);
    expect(after?.lastSeenAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('leaves a recent last_seen_at alone, so activity writes at most once an hour', async () => {
    const id = await createVisitor({ ipHash: null });
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    await db().update(visitors).set({ lastSeenAt: tenMinutesAgo }).where(eq(visitors.id, id));

    expect(await touchVisitor(id)).toBe(true);
    expect((await findVisitor(id))?.lastSeenAt).toEqual(tenMinutesAgo);
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
    if (!('visitorId' in result)) throw new Error('No Visitor was created');
    expect(result.created).toBe(true);
    expect(result.visitorId).not.toBe(cookieValue);
    expect(await findVisitor(result.visitorId)).toMatchObject({ createdIpHash: 'hash' });
  });

  it('creates at most five new Visitors per IP hash per day', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect(await resolveVisitor({ cookieValue: undefined, ipHash: 'busy' })).toMatchObject({
        created: true,
      });
    }
    expect(await resolveVisitor({ cookieValue: undefined, ipHash: 'busy' })).toEqual({
      error: 'visitor_limit',
    });
    // Other IPs, unknown IPs and returning Visitors from the same IP are not affected.
    expect(await resolveVisitor({ cookieValue: undefined, ipHash: 'other' })).toMatchObject({
      created: true,
    });
    expect(await resolveVisitor({ cookieValue: undefined, ipHash: null })).toMatchObject({
      created: true,
    });
    const returning = await createVisitor({ ipHash: 'busy' });
    expect(await resolveVisitor({ cookieValue: returning, ipHash: 'busy' })).toEqual({
      visitorId: returning,
      created: false,
    });
  });

  it('keeps to the limit when new Visitors arrive at the same time', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => resolveVisitor({ cookieValue: undefined, ipHash: 'burst' })),
    );
    expect(results.filter((result) => 'visitorId' in result)).toHaveLength(5);
  });
});
