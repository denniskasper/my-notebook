/**
 * Whether a mutating request comes from this app's own pages: its Origin must
 * name the host it was sent to (as Server Actions check it). Route Handlers
 * need this explicitly; together with the SameSite=Lax cookie it stops CSRF.
 */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get('origin');
  const host = headers.get('x-forwarded-host')?.split(',')[0]?.trim() || headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
