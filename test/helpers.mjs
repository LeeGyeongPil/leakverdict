// Shared test helpers. The language environment is pinned here so results do not depend on
// the machine running the tests: LANG=C.UTF-8, no LC_* and no LEAKVERDICT_LANG unless a test sets them.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const fixture = (name) => join(root, 'test', 'fixtures', name);
export const dist = (rel) => join(root, 'dist', rel);
export const BIN = dist('esm/bin.js');

/** Environment for child processes and in-process CLI calls. */
export function cleanEnv(extra = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('LEAKVERDICT_') || key.startsWith('LC_') || key === 'LANG' || key === 'LANGUAGE') {
      delete env[key];
    }
  }
  delete env.NODE_OPTIONS;
  env.LANG = 'C.UTF-8';
  return { ...env, ...extra };
}

/** Run the CLI as a real child process. */
export function runBin(args, { env = {}, timeout = 120_000, cwd = root } = {}) {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    env: cleanEnv(env),
    timeout,
    cwd,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Run the CLI in this process with a fixed environment; returns { code, stdout, stderr }. */
export async function runInProcess(args, { env = {}, readFile } = {}) {
  const { runCli } = await import(dist('esm/cli.js'));
  let stdout = '';
  let stderr = '';
  const code = await runCli(args, {
    env: cleanEnv(env),
    stdout: (s) => {
      stdout += s;
    },
    stderr: (s) => {
      stderr += s;
    },
    readFile,
  });
  return { code, stdout, stderr };
}

export function makeTmp(prefix = 'leakverdict-test-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export const HANGUL = /[ㄱ-ㆎ가-힣]/;

/** Build rows with exact, hand-computable values (bytes). */
export function makeRows(n, shape, { pid = 1, node = 'v22.0.0', intervalMs = 60_000 } = {}) {
  const MiB = 1024 * 1024;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const s = shape(i);
    rows.push({
      v: 1,
      t: 1_700_000_000_000 + i * intervalMs,
      pid,
      threadId: 0,
      node,
      rss: (s.rss ?? 100) * MiB,
      heapTotal: (s.heapTotal ?? 50) * MiB,
      heapUsed: (s.heapUsed ?? 20) * MiB,
      external: (s.external ?? 4) * MiB,
      arrayBuffers: (s.arrayBuffers ?? 1) * MiB,
      resources: s.resources ?? {},
    });
  }
  return rows;
}
