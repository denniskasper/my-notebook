import { describe, expect, it } from 'vitest';

import { versionLabel } from './version';

const sha = '2bef0919a7698b8eb262b131a99ac53b8f5e8e6f';

describe('versionLabel', () => {
  it('shows the version and the short commit, linking to the commit on GitHub', () => {
    expect(versionLabel({ version: '0.1.0', commit: sha })).toEqual({
      text: 'v0.1.0 · 2bef091',
      href: `https://github.com/denniskasper/my-notebook/commit/${sha}`,
    });
  });

  it('shows only the version when the commit is unknown', () => {
    expect(versionLabel({ version: '0.1.0', commit: 'unknown' })).toEqual({
      text: 'v0.1.0',
      href: null,
    });
  });

  it('treats anything but a hex commit id as unknown', () => {
    expect(versionLabel({ version: '0.1.0', commit: 'e2e' }).href).toBeNull();
    expect(versionLabel({ version: '0.1.0', commit: '../../evil' }).text).toBe('v0.1.0');
  });
});
