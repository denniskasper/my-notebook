import { describe, expect, it } from 'vitest';

import { isPublicAddress } from './address-guard';

describe('isPublicAddress', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '100.100.100.200',
    '127.0.0.1',
    '127.255.255.254',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.170',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
  ])('blocks the private, loopback, link-local or metadata IPv4 address %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd00:ec2::254',
    'ff02::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
    '::ffff:a9fe:a9fe',
    '::ffff:10.0.0.1',
    '64:ff9b::a9fe:a9fe',
    '64:ff9b:1::a00:1',
    '2001:0:4136:e378:8000:63bf:3fff:fdd2',
    '2002:a9fe:a9fe::1',
    '::127.0.0.1',
  ])('blocks the private or IPv4-embedding IPv6 address %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(['93.184.215.14', '172.32.0.1', '8.8.8.8', '2606:4700::6810:84e5', '::ffff:8.8.8.8'])(
    'allows the public address %s',
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );

  it('blocks anything that is not an IP address', () => {
    expect(isPublicAddress('example.org')).toBe(false);
    expect(isPublicAddress('')).toBe(false);
  });
});
