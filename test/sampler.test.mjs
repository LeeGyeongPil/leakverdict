import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { cleanEnv, dist, makeTmp } from './helpers.mjs';

const { startSampler, sampleOnce, validateRow, LeakverdictError } = await import(dist('esm/index.js'));

const lines = (file) => readFileSync(file, 'utf8').split('\n').filter((l) => l !== '');

test('AC-3a: file rotation keeps at most maxFiles files of at most maxBytes each', async () => {
  const tmp = makeTmp();
  try {
    const file = join(tmp.dir, 'mem.jsonl');
    const s = startSampler({ file, intervalMs: 10, maxBytes: 2000, maxFiles: 2 });
    await sleep(300);
    await s.stop();
    const files = readdirSync(tmp.dir);
    assert.ok(files.length <= 2, 'files: ' + files.join(', '));
    assert.ok(files.includes('mem.jsonl.1'), 'rotation happened');
    for (const f of files) assert.ok(statSync(join(tmp.dir, f)).size <= 2000, f);
  } finally {
    tmp.cleanup();
  }
});

test('AC-3b: stop() ends writing and can be called twice', async () => {
  const tmp = makeTmp();
  try {
    const file = join(tmp.dir, 'mem.jsonl');
    const s = startSampler({ file, intervalMs: 10 });
    await sleep(80);
    await s.stop();
    const before = lines(file).length;
    await sleep(100);
    assert.equal(lines(file).length, before);
    await s.stop(); // second call is a no-op
    s.sampleNow(); // sampling a stopped sampler does not write
    assert.equal(lines(file).length, before);
  } finally {
    tmp.cleanup();
  }
});

test('AC-3c/d: a sampler-only process exits by itself and adds no Timeout resource', () => {
  const tmp = makeTmp();
  try {
    const script = join(tmp.dir, 'child.mjs');
    writeFileSync(
      script,
      [
        "import { startSampler } from '" + dist('esm/index.js').replace(/\\/g, '/') + "';",
        "const count = () => process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;",
        'const before = count();',
        'startSampler({ intervalMs: 20 });',
        "console.log(JSON.stringify({ before, after: count() }));",
      ].join('\n'),
    );
    const started = Date.now();
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 3000, env: cleanEnv() });
    assert.equal(result.status, 0, 'exited on its own (status ' + result.status + ', signal ' + result.signal + ')');
    assert.ok(Date.now() - started < 3000);
    const seen = JSON.parse(result.stdout);
    assert.equal(seen.after, seen.before);
  } finally {
    tmp.cleanup();
  }
});

test('AC-3e: without a file the ring buffer holds at most maxRows rows', async () => {
  const s = startSampler({ intervalMs: 5, maxRows: 5 });
  await sleep(120);
  assert.equal(s.rows().length, 5);
  await s.stop();
  assert.ok(s.rows().length <= 5);
});

test('AC-3f: a write failure is reported through onError as E_WRITE, not thrown', async () => {
  const tmp = makeTmp();
  try {
    const blocker = join(tmp.dir, 'blocker');
    writeFileSync(blocker, 'a regular file');
    const errors = [];
    const s = startSampler({ file: join(blocker, 'mem.jsonl'), intervalMs: 10, onError: (e) => errors.push(e) });
    await sleep(60);
    await s.stop();
    assert.ok(errors.length >= 1);
    assert.ok(errors[0] instanceof LeakverdictError);
    assert.equal(errors[0].code, 'E_WRITE');
    assert.ok(typeof errors[0].params.reason === 'string');
    // a throwing onError must not escape either
    const s2 = startSampler({
      file: join(blocker, 'x.jsonl'),
      onError: () => {
        throw new Error('callback bug');
      },
    });
    await s2.stop();
  } finally {
    tmp.cleanup();
  }
});

test('rows follow schema v1 and carry counters', async () => {
  const s = startSampler({ maxRows: 10 });
  s.count('requests');
  s.count('requests', 4);
  const row = s.sampleNow();
  await s.stop();
  assert.doesNotThrow(() => validateRow(row));
  assert.equal(row.v, 1);
  assert.equal(row.counters.requests, 5);
  assert.equal(row.pid, process.pid);
  assert.equal(row.node, process.version);
  assert.ok(row.rss > 0 && row.heapUsed > 0);
  assert.equal(sampleOnce().counters, undefined);
});

test('invalid sampler options throw E_BAD_OPTION', () => {
  assert.throws(() => startSampler({ intervalMs: 0 }), { code: 'E_BAD_OPTION' });
  assert.throws(() => startSampler({ maxFiles: 1.5 }), { code: 'E_BAD_OPTION' });
  assert.throws(() => startSampler({ file: '' }), { code: 'E_BAD_OPTION' });
  const s = startSampler();
  assert.throws(() => s.count('', 1), { code: 'E_BAD_OPTION' });
  return s.stop();
});

test('maxFiles 1 truncates instead of keeping old copies', async () => {
  const tmp = makeTmp();
  try {
    const file = join(tmp.dir, 'one.jsonl');
    const s = startSampler({ file, intervalMs: 10, maxBytes: 1500, maxFiles: 1 });
    await sleep(200);
    await s.stop();
    assert.deepEqual(readdirSync(tmp.dir), ['one.jsonl']);
    assert.ok(statSync(file).size <= 1500);
  } finally {
    tmp.cleanup();
  }
});
