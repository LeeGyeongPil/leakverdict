// Runs every test/*.test.mjs with the built-in test runner.
// The file list is built here instead of using a glob argument, because `node --test` only
// understands globs from Node 21 on and this package supports Node 20.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const testDir = join(root, 'test');
const files = readdirSync(testDir)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => join(testDir, name));

if (files.length === 0) {
  console.error('no test files found in ' + testDir);
  process.exit(1);
}
// Two guards against a hung run: --test-timeout fails any single test that takes over 2 minutes,
// and the spawnSync timeout kills the whole runner after 12 minutes (the CI job limit is 15).
const result = spawnSync(process.execPath, ['--test', '--test-timeout=120000', ...files], {
  stdio: ['ignore', 'inherit', 'inherit'],
  cwd: root,
  timeout: 12 * 60_000,
  killSignal: 'SIGKILL',
});
if (result.error) console.error('test run did not finish: ' + result.error.message);
process.exit(result.status ?? 1);
