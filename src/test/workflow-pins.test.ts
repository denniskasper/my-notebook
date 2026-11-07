import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Supply-chain guard: tags can be moved (the trivy-action compromise), commit SHAs can't.
const WORKFLOWS = join(process.cwd(), '.github', 'workflows');
const PINNED = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+(\.\d+)*$/;

const usesLines = readdirSync(WORKFLOWS)
  .filter((file) => /\.ya?ml$/.test(file))
  .flatMap((file) =>
    readFileSync(join(WORKFLOWS, file), 'utf8')
      .split('\n')
      .map((line) => line.match(/^\s*(?:-\s+)?uses:\s*(.+?)\s*$/)?.[1])
      .filter((uses): uses is string => uses !== undefined && !uses.startsWith('./'))
      .map((uses) => ({ file, uses })),
  );

describe('GitHub Actions workflows', () => {
  it('use third-party actions', () => {
    expect(usesLines.length).toBeGreaterThan(0);
  });

  it.each(usesLines)('$file pins $uses by full commit SHA with its version', ({ uses }) => {
    expect(uses).toMatch(PINNED);
  });
});
