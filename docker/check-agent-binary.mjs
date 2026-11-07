// Run inside the production image (CI smoke check): resolves the Claude Code
// binary the way the Agent SDK does and starts it. Fails if the standalone
// output lost the SDK's optional, per-platform binary package.
//   docker run --rm -i --entrypoint node <image> --input-type=module - < docker/check-agent-binary.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const store = join(process.cwd(), 'node_modules', '.pnpm');
const sdkDir = readdirSync(store).find((name) =>
  name.startsWith('@anthropic-ai+claude-agent-sdk@'),
);
if (!sdkDir)
  throw new Error('@anthropic-ai/claude-agent-sdk is missing from the standalone output');

const sdk = realpathSync(
  join(store, sdkDir, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs'),
);
const binary = createRequire(sdk).resolve(
  `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/claude`,
);
const version = execFileSync(binary, ['--version']).toString().trim();
console.log(`Agent SDK binary: ${binary} (${version})`);
