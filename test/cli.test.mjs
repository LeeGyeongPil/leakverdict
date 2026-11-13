import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture, makeRows, makeTmp, runBin, runInProcess } from './helpers.mjs';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

test('AC-5: --fail-on exit codes', () => {
  assert.equal(runBin(['analyze', fixture('js-heap.jsonl'), '--fail-on', 'js-heap']).status, 1);
  assert.equal(runBin(['analyze', fixture('js-heap.jsonl'), '--fail-on', 'handles']).status, 0);
  assert.equal(runBin(['analyze', fixture('sawtooth-flat.jsonl'), '--fail-on', 'any']).status, 0);
  assert.equal(runBin(['analyze', fixture('js-heap.jsonl'), '--fail-on', 'any']).status, 1);
  assert.equal(runBin(['analyze', fixture('mixed.jsonl'), '--fail-on', 'handles,js-heap']).status, 1);
  assert.equal(runBin(['analyze', fixture('js-heap.jsonl')]).status, 0, 'no --fail-on never fails');
});

test('AC-5: --format json is parseable and lists findings[].kind', () => {
  const r = runBin(['analyze', fixture('mixed.jsonl'), '--format', 'json']);
  assert.equal(r.status, 0, r.stderr);
  const doc = JSON.parse(r.stdout);
  assert.deepEqual(
    doc.findings.map((f) => f.kind),
    ['native-buffer', 'handles'],
  );
  assert.equal(doc.version, 1);
  assert.equal(doc.span.samples, 60);
  assert.ok(doc.findings[0].evidence[0].delta > 0);
  assert.equal(doc.lang, 'en');
});

test('AC-5: --format md has a table header row and a separator', () => {
  const r = runBin(['analyze', fixture('js-heap.jsonl'), '--format', 'md']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^\| Verdict \| Confidence \| Evidence \| Next step \|$/m);
  assert.match(r.stdout, /^\|---\|---\|---\|---\|$/m);
  assert.match(r.stdout, /\*\*js-heap\*\*/);
});

test('text report shows the verdict, evidence and next step', () => {
  const r = runBin(['analyze', fixture('allocator.jsonl')]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /allocator-retention \(suspected\)/);
  assert.match(r.stdout, /rss: /);
  assert.match(r.stdout, /may not be an application leak/);
});

test('multi-pid warning is printed in the report', () => {
  const r = runBin(['analyze', fixture('multi-pid.jsonl')]);
  assert.match(r.stdout, /several processes \(pids 1111, 2222\)/);
  const picked = runBin(['analyze', fixture('multi-pid.jsonl'), '--pid', '1111', '--format', 'json']);
  assert.equal(JSON.parse(picked.stdout).findings[0].kind, 'none');
});

test('--version, --help and no arguments', () => {
  const v = runBin(['--version']);
  assert.equal(v.status, 0);
  assert.equal(v.stdout.trim(), version);
  for (const args of [['--help'], ['-h'], []]) {
    const h = runBin(args);
    assert.equal(h.status, 0);
    assert.match(h.stdout, /leakverdict analyze/);
    assert.match(h.stdout, /leakverdict simulate/);
    assert.match(h.stdout, /buffer, jsobj, handle, churn, idle, release/);
  }
});

test('--help lists all six --fail-on values in both languages, matching the option error', () => {
  const kinds = ['js-heap', 'native-buffer', 'handles', 'allocator-retention', 'none', 'insufficient-data'];
  for (const lang of ['en', 'ko']) {
    const help = runBin(['--help', '--lang', lang]).stdout;
    assert.ok(!help.includes('{kinds}'), `${lang}: placeholder filled`);
    for (const k of kinds) assert.ok(help.includes(k), `${lang} help lists ${k}`);
    assert.match(help, /any/);
    assert.match(help, /none.*insufficient-data/s);
    const err = runBin(['analyze', fixture('js-heap.jsonl'), '--fail-on', 'bogus', '--lang', lang]);
    assert.equal(err.status, 2);
    for (const k of kinds) assert.ok(err.stderr.includes(k), `${lang} error lists ${k}`);
  }
});

test('analysis thresholds can be changed from the command line', () => {
  const strict = runBin(['analyze', fixture('js-heap.jsonl'), '--min-growth-mb', '500', '--fail-on', 'js-heap']);
  assert.equal(strict.status, 0);
  assert.match(strict.stdout, /none/);
  const few = runBin(['analyze', fixture('js-heap.jsonl'), '--min-samples', '100']);
  assert.match(few.stdout, /insufficient-data/);
});

test('in-process CLI call returns the exit code and keeps stdout and stderr separate', async () => {
  const ok = await runInProcess(['analyze', fixture('handles.jsonl'), '--fail-on', 'handles']);
  assert.equal(ok.code, 1);
  assert.equal(ok.stderr, '');
  assert.match(ok.stdout, /resources\.Timeout/);
});

// ---- --skip (warm-up) ----
// 30 rows, 1 minute apart: a 6 MB warm-up step inside the first 5 minutes, flat afterwards.
const warmupRows = makeRows(30, (i) => ({ heapUsed: i < 5 ? 20 + i * 2 : 30, rss: 100, heapTotal: 50 }));
const withWarmup = () => {
  const { dir, cleanup } = makeTmp();
  const file = join(dir, 'warm.jsonl');
  writeFileSync(file, warmupRows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return { file, cleanup };
};

test('--skip drops the warm-up: 10m, 90s and 1h parse; the verdict changes', async () => {
  const { file, cleanup } = withWarmup();
  try {
    const none = await runInProcess(['analyze', file, '--format', 'json']);
    assert.equal(JSON.parse(none.stdout).skipped, 0);
    assert.equal(JSON.parse(none.stdout).findings[0].kind, 'js-heap');
    const skipped = await runInProcess(['analyze', file, '--format', 'json', '--skip', '5m']);
    const doc = JSON.parse(skipped.stdout);
    assert.equal(doc.skipped, 5);
    assert.equal(doc.span.samples, 25);
    assert.equal(doc.findings[0].kind, 'none');
    const s90 = JSON.parse((await runInProcess(['analyze', file, '--format', 'json', '--skip', '90s'])).stdout);
    assert.equal(s90.skipped, 2);
    const h1 = JSON.parse((await runInProcess(['analyze', file, '--format', 'json', '--skip', '1h'])).stdout);
    assert.equal(h1.skipped, 30);
    assert.equal(h1.findings[0].kind, 'insufficient-data');
    const sim = await runInProcess(['analyze', file, '--skip', '10m']);
    assert.equal(sim.code, 0);
  } finally {
    cleanup();
  }
});

test('--skip leaving too few rows says how many rows were skipped (en and ko)', async () => {
  const { file, cleanup } = withWarmup();
  try {
    const en = await runInProcess(['analyze', file, '--skip', '25m', '--lang', 'en']);
    assert.match(en.stdout, /Only 5 samples were usable/);
    assert.match(en.stdout, /25 rows were skipped by --skip/);
    const ko = await runInProcess(['analyze', file, '--skip', '25m', '--lang', 'ko']);
    assert.match(ko.stdout, /--skip 으로 25개 행을 건너뛰었습니다/);
  } finally {
    cleanup();
  }
});

test('--skip rejects values without a valid unit, negative, fractional and empty values', async () => {
  const { file, cleanup } = withWarmup();
  try {
    for (const bad of ['10', '-5m', '1.5m', '', '5d', 'm', '10M']) {
      const en = await runInProcess(['analyze', file, '--skip', bad, '--lang', 'en']);
      assert.equal(en.code, 2, `"${bad}" is rejected`);
      assert.match(en.stderr, /--skip/);
      const ko = await runInProcess(['analyze', file, '--skip', bad, '--lang', 'ko']);
      assert.equal(ko.code, 2);
      // "-5m" and "" never reach the parser (parseArgs reports a missing value); the rest list the units.
      if (bad === '' || bad.startsWith('-')) continue;
      assert.match(en.stderr, /whole number followed by one of s, m, h/);
      assert.match(ko.stderr, /정수 뒤에 s, m, h 중 하나/);
    }
  } finally {
    cleanup();
  }
});

test('--help documents --skip in both languages and the new line fits in 80 columns', () => {
  for (const lang of ['en', 'ko']) {
    const help = runBin(['--help', '--lang', lang]).stdout;
    assert.ok(!help.includes('{skipUnits}'), `${lang}: placeholder filled`);
    const line = help.split('\n').find((l) => l.includes('--skip'));
    assert.ok(line, `${lang}: --skip line`);
    assert.match(line, /--skip <n><s\|m\|h>/);
    assert.ok([...line].length <= 80, `${lang}: ${[...line].length} columns`);
  }
});
