import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fixture, runBin, runInProcess } from './helpers.mjs';

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
