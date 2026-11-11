import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cleanEnv, dist, makeTmp, root } from './helpers.mjs';

const { validateRow } = await import(dist('esm/index.js'));

function collect(tmp, args, appFile, appSource) {
  const app = join(tmp.dir, appFile);
  writeFileSync(app, appSource);
  const out = join(tmp.dir, 'mem.jsonl');
  // Run from the package root so the package name resolves to this checkout (self-reference).
  const result = spawnSync(process.execPath, [...args, app], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    env: cleanEnv({ LEAKVERDICT_FILE: out, LEAKVERDICT_INTERVAL_MS: '50' }),
  });
  assert.equal(result.status, 0, result.stderr);
  const rows = readFileSync(out, 'utf8')
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => JSON.parse(l));
  return rows;
}

test('AC-4: node --import leakverdict/register writes schema v1 rows', () => {
  const tmp = makeTmp();
  try {
    const rows = collect(tmp, ['--import', 'leakverdict/register'], 'app.mjs', 'setTimeout(() => {}, 400);\n');
    assert.ok(rows.length >= 2, 'rows: ' + rows.length);
    for (const row of rows) validateRow(row);
  } finally {
    tmp.cleanup();
  }
});

test('AC-4: node --require leakverdict/register writes schema v1 rows', () => {
  const tmp = makeTmp();
  try {
    const rows = collect(tmp, ['--require', 'leakverdict/register'], 'app.cjs', 'setTimeout(() => {}, 400);\n');
    assert.ok(rows.length >= 2, 'rows: ' + rows.length);
    for (const row of rows) validateRow(row);
    for (const key of ['v', 't', 'pid', 'threadId', 'node', 'rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers', 'resources']) {
      assert.ok(key in rows[0], key);
    }
  } finally {
    tmp.cleanup();
  }
});

test('register with a bad interval warns on stderr and does not break the app', () => {
  const tmp = makeTmp();
  try {
    const app = join(tmp.dir, 'app.mjs');
    writeFileSync(app, "console.log('app ran');\n");
    const result = spawnSync(process.execPath, ['--import', 'leakverdict/register', app], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
      env: cleanEnv({ LEAKVERDICT_FILE: join(tmp.dir, 'x.jsonl'), LEAKVERDICT_INTERVAL_MS: 'abc' }),
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /app ran/);
    assert.match(result.stderr, /\[leakverdict\] LEAKVERDICT_INTERVAL_MS="abc" is not a positive integer; sampler not started/);
  } finally {
    tmp.cleanup();
  }
});
