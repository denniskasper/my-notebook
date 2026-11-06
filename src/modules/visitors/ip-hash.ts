import { createHmac } from 'node:crypto';

/** HMAC-SHA256 of the client IP, so per-IP limits work without storing IPs. */
export function hashIp(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(ip.trim().toLowerCase()).digest('hex');
}

/** The client IP as reported by the reverse proxy (first `x-forwarded-for` hop). */
export function clientIp(headers: Pick<Headers, 'get'>): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return headers.get('x-real-ip')?.trim() || null;
}
