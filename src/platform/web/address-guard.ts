import { BlockList, isIPv4, isIPv6 } from 'node:net';

// Everything a server-side fetch must never reach: private networks, loopback,
// link-local (cloud metadata at 169.254.169.254), CGNAT, documentation,
// benchmarking, multicast and reserved ranges.
const BLOCKED_IPV4: ReadonlyArray<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const BLOCKED_IPV6: ReadonlyArray<[string, number]> = [
  // Unspecified, loopback and the deprecated IPv4-compatible form.
  ['::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  // 6to4 embeds an IPv4 address anywhere; nothing legitimate needs it any more.
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
];

const blocked = new BlockList();
for (const [network, prefix] of BLOCKED_IPV4) blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of BLOCKED_IPV6) blocked.addSubnet(network, prefix, 'ipv6');

/**
 * Whether a server-side fetch may connect to this IP address: false for
 * anything private, loopback, link-local, metadata or reserved, including
 * IPv4 addresses wrapped in IPv6 (mapped or NAT64), and for non-addresses.
 */
export function isPublicAddress(address: string): boolean {
  if (isIPv4(address)) return !blocked.check(address, 'ipv4');
  if (!isIPv6(address)) return false;
  const embedded = embeddedIpv4(address);
  if (embedded !== null) return !blocked.check(embedded, 'ipv4');
  return !blocked.check(address, 'ipv6');
}

/** The IPv4 address inside an IPv4-mapped (::ffff:0:0/96) or NAT64 (64:ff9b::/96) address. */
function embeddedIpv4(address: string): string | null {
  const groups = expandIpv6(address);
  const prefix = groups
    .slice(0, 6)
    .map((group) => group.toString(16))
    .join(':');
  if (prefix !== '0:0:0:0:0:ffff' && prefix !== '64:ff9b:0:0:0:0') return null;
  const high = groups[6] ?? 0;
  const low = groups[7] ?? 0;
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

/** The eight 16-bit groups of a valid IPv6 address (dotted IPv4 tail included). */
function expandIpv6(address: string): number[] {
  let text = address.toLowerCase();
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number) as [number, number, number, number];
    const tail = `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
    text = text.slice(0, dotted.index) + tail;
  }
  const [head = '', rest] = text.split('::');
  const parse = (part: string) => (part === '' ? [] : part.split(':').map((g) => parseInt(g, 16)));
  const left = parse(head);
  const right = rest === undefined ? [] : parse(rest);
  const zeros = Array.from({ length: 8 - left.length - right.length }, () => 0);
  return [...left, ...zeros, ...right];
}
