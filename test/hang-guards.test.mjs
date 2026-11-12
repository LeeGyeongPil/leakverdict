// Regression tests for the CI run that never finished: every layer must have a time limit.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cleanEnv, dist, makeTmp, root } from './helpers.mjs';

const read = (...p) => readFileSync(join(root, ...p), 'utf8');

test('CI job and long steps have timeout-minutes of 15 or less', () => {
  const ci = read('.github', 'workflows', 'ci.yml');
  const jobLimit = /^ {4}timeout-minutes:\s*(\d+)/m.exec(ci);
  assert.ok(jobLimit && Number(jobLimit[1]) <= 15, 'job needs timeout-minutes <= 15');
  assert.ok((ci.match(/^ {8}timeout-minutes:\s*\d+/gm) ?? []).length >= 3, 'npm ci, npm test and the pack check need step limits');
});

test('the test runner passes --test-timeout and kills a hung run', () => {
  const src = read('scripts', 'run-tests.mjs');
  assert.match(src, /--test-timeout=\d+/);
  assert.match(src, /timeout:\s*\d/);
  assert.match(src, /killSignal/);
});

test('version is the same in package.json, package-lock.json, CHANGELOG and the CLI', () => {
  const v = JSON.parse(read('package.json')).version;
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.version, v);
  assert.equal(lock.packages[''].version, v);
  assert.match(read('CHANGELOG.md'), new RegExp('^## \\[' + v.replace(/\./g, '\\.') + '\\]', 'm'));
  const out = spawnSync(process.execPath, [dist('esm/bin.js'), '--version'], {
    encoding: 'utf8',
    timeout: 30_000,
    env: cleanEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(out.stdout.trim(), v);
});

test('after stop() the sampler leaves no Timeout handle and the process ends by itself', () => {
  const tmp = makeTmp();
  try {
    const script = join(tmp.dir, 'child.mjs');
    writeFileSync(
      script,
      [
        "import { startSampler } from '" + dist('esm/index.js').replace(/\\/g, '/') + "';",
        "const count = () => process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;",
        'const before = count();',
        'const s = startSampler({ intervalMs: 10 });',
        'await new Promise((r) => setTimeout(r, 50));',
        's.stop();',
        'await new Promise((r) => setImmediate(r));',
        'console.log(JSON.stringify({ before, after: count() }));',
      ].join('\n'),
    );
    const r = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      timeout: 10_000,
      killSignal: 'SIGKILL',
      env: cleanEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.equal(r.status, 0, 'exited by itself: ' + r.signal);
    const seen = JSON.parse(r.stdout);
    assert.equal(seen.after, seen.before);
  } finally {
    tmp.cleanup();
  }
});
