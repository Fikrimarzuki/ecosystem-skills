// Fails `pnpm check` unless it runs under the pnpm version this repository pins (package.json "packageManager").
// pnpm 11 and later switch to the pinned version on their own when they can fetch or find it; when they cannot (for
// example offline, or in a sandbox without the cached version), they run as themselves, and the results would not
// be a reproduction of this repository's checks. This makes that visible instead of silent.
import { readFileSync } from 'node:fs';

const pinned = /^pnpm@(\d+\.\d+\.\d+)/.exec(
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).packageManager ??
    '',
)?.[1];
const running = /\bpnpm\/(\d+\.\d+\.\d+)/.exec(process.env.npm_config_user_agent ?? '')?.[1];
if (!pinned) {
  console.error('package.json has no "packageManager": "pnpm@x.y.z" pin');
  process.exit(1);
}
if (running !== pinned) {
  console.error(
    `pnpm check must run under pnpm ${pinned} (package.json "packageManager"); this is ${running ? `pnpm ${running}` : 'not pnpm'}.\n` +
      `Use a pnpm that resolves to ${pinned}: \`corepack enable\` (then \`pnpm --version\` in this folder prints ${pinned}), ` +
      `or pnpm 11+ with network access or a cached ${pinned} so it can switch. Results under another version are not a reproduction.`,
  );
  process.exit(1);
}
console.log(`pnpm ${running} matches the pinned version.`);
