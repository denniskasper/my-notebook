import { describe, expect, it } from 'vitest';

import { isSameOrigin } from '.';

const headers = (values: Record<string, string>) => new Headers(values);

describe('isSameOrigin', () => {
  it('accepts a request whose Origin matches the host it was sent to', () => {
    expect(isSameOrigin(headers({ origin: 'http://localhost:3000', host: 'localhost:3000' }))).toBe(
      true,
    );
  });

  it('prefers the host a reverse proxy forwarded', () => {
    expect(
      isSameOrigin(
        headers({
          origin: 'https://notebook.example',
          host: '127.0.0.1:3000',
          'x-forwarded-host': 'notebook.example',
        }),
      ),
    ).toBe(true);
  });

  it('rejects another origin, a missing Origin and a malformed one', () => {
    expect(isSameOrigin(headers({ origin: 'https://evil.example', host: 'localhost:3000' }))).toBe(
      false,
    );
    expect(isSameOrigin(headers({ host: 'localhost:3000' }))).toBe(false);
    expect(isSameOrigin(headers({ origin: 'null', host: 'localhost:3000' }))).toBe(false);
  });
});
