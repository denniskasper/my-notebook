import { describe, expect, it } from 'vitest';

import { clientIp, hashIp } from './ip-hash';
import { parseVisitorId } from './store';

describe('hashIp', () => {
  it('is stable for the same IP and secret, and hides the IP', () => {
    const hash = hashIp('203.0.113.7', 'secret');
    expect(hash).toBe(hashIp(' 203.0.113.7 ', 'secret'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('203');
  });

  it('differs per secret', () => {
    expect(hashIp('203.0.113.7', 'a')).not.toBe(hashIp('203.0.113.7', 'b'));
  });
});

describe('clientIp', () => {
  it('takes the first x-forwarded-for hop', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
    expect(clientIp(headers)).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip, then null', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe('parseVisitorId', () => {
  it('accepts a UUID and rejects anything else', () => {
    const id = '019a5a1e-7c2b-7d4e-9f00-123456789abc';
    expect(parseVisitorId(id)).toBe(id);
    expect(parseVisitorId(undefined)).toBeNull();
    expect(parseVisitorId('not-a-uuid')).toBeNull();
    expect(parseVisitorId("'; drop table visitors; --")).toBeNull();
  });
});
