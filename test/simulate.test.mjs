import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { makeTmp, runBin } from './helpers.mjs';

// Real child Node processes grow real memory. Time limits are generous because the
// machine may be busy; slowness is never treated as an error.
for (const [scenario, kind] of [
  ['buffer', 'native-buffer'],
  ['jsobj', 'js-heap'],
  ['handle', 'handles'],
]) {
  test(`AC-2: simulate ${scenario} is judged ${kind}`, () => {
    const started = Date.now();
    const r = runBin(['simulate', scenario, '--steps', '10', '--interval-ms', '50', '--format', 'json'], {
      timeout: 60_000,
    });
    assert.equal(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.equal(report.findings[0].kind, kind);
    assert.ok(Date.now() - started < 10_000, 'took ' + (Date.now() - started) + ' ms');
  });
}

test('simulate --out keeps the recorded JSONL and idle is judged none', () => {
  const tmp = makeTmp();
  try {
    const out = join(tmp.dir, 'idle.jsonl');
    const r = runBin(['simulate', 'idle', '--out', out, '--format', 'json'], { timeout: 60_000 });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).findings[0].kind, 'none');
    assert.ok(existsSync(out));
    assert.equal(readFileSync(out, 'utf8').trim().split('\n').length, 11); // start + 10 steps
  } finally {
    tmp.cleanup();
  }
});

test('simulate leaves no temporary files behind when --out is not given', () => {
  const tmp = makeTmp();
  try {
    const r = runBin(['simulate', 'idle', '--format', 'json'], { timeout: 60_000, env: { TMPDIR: tmp.dir } });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(readdirSync(tmp.dir), []);
  } finally {
    tmp.cleanup();
  }
});
