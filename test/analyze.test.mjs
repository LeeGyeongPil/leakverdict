import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dist, fixture, makeRows } from './helpers.mjs';

const { analyze, readJsonl, renderReport } = await import(dist('esm/index.js'));
const expected = JSON.parse(readFileSync(fixture('expected.json'), 'utf8'));
const MiB = 1024 * 1024;

test('AC-1: fixtures yield expected verdicts', async () => {
  const names = Object.keys(expected);
  assert.equal(names.length, 8);
  for (const name of names) {
    const { rows, warnings } = await readJsonl(fixture(name));
    const report = analyze(rows);
    const kinds = report.findings.map((f) => f.kind);
    assert.deepEqual(kinds, expected[name].kinds, `${name}: verdicts`);
    assert.deepEqual(
      warnings.map((w) => w.code),
      expected[name].warnings,
      `${name}: warnings`,
    );
    // allocator-retention never appears next to another verdict
    if (kinds.length > 1) assert.ok(!kinds.includes('allocator-retention'), name);
    // evidence names the metric, the growth in MB and R2 once rendered
    if (kinds[0] !== 'insufficient-data' && kinds[0] !== 'none') {
      const text = renderReport({ ...report, warnings: [] }, { format: 'text', lang: 'en' });
      for (const e of report.findings.flatMap((f) => f.evidence).filter((e) => e.role === 'grew')) {
        assert.ok(text.includes(e.metric), `${name}: ${e.metric}`);
      }
      assert.match(text, /\+\d+\.\d MB|\(\+\d+\)/);
      assert.match(text, /R2 \d\.\d\d/);
    }
  }
});

test('big GC sawtooth with a flat floor is not a leak', async () => {
  const { rows } = await readJsonl(fixture('sawtooth-flat.jsonl'));
  const peak = Math.max(...rows.map((r) => r.heapUsed));
  const floor = Math.min(...rows.map((r) => r.heapUsed));
  assert.ok(peak - floor > 15 * MiB, 'fixture really has a large sawtooth');
  assert.deepEqual(
    analyze(rows).findings.map((f) => f.kind),
    ['none'],
  );
});

test('evidence numbers match a hand computed series', () => {
  // 24 rows, one per minute. heapUsed = 10 MiB + i, plus 2 MiB on rows where i % 3 != 0.
  // 8 windows of 3 rows: the floor of window w is row 3w -> 10 + 3w MiB.
  // first = 10 MiB, last = 31 MiB, delta = 21 MiB; slope = 3 MiB per 180 s = 60 MiB/h; R2 = 1.
  const rows = makeRows(24, (i) => ({ heapUsed: 10 + i + (i % 3 === 0 ? 0 : 2) }));
  const report = analyze(rows);
  assert.deepEqual(
    report.findings.map((f) => f.kind),
    ['js-heap'],
  );
  const e = report.findings[0].evidence[0];
  assert.equal(e.metric, 'heapUsed');
  assert.equal(e.role, 'grew');
  assert.equal(e.from, 10 * MiB);
  assert.equal(e.to, 31 * MiB);
  assert.equal(e.delta, 21 * MiB);
  assert.ok(Math.abs(e.slopePerHour - 60 * MiB) < 1, 'slope per hour');
  assert.ok(Math.abs(e.r2 - 1) < 1e-9, 'r2');
  assert.equal(report.findings[0].confidence, 'high');
  assert.equal(report.span.samples, 24);
  assert.equal(report.span.to - report.span.from, 23 * 60_000);
});

test('handle growth is measured above the baseline kinds', () => {
  // PipeWrap stays 1 (baseline); Timeout rises by 3 every row: 8 windows of 3 -> delta 3*21 = 63
  const rows = makeRows(24, (i) => ({ resources: { PipeWrap: 1, Timeout: 3 * i } }));
  const finding = analyze(rows).findings[0];
  assert.equal(finding.kind, 'handles');
  assert.deepEqual(
    finding.evidence.map((e) => e.metric),
    ['resources.Timeout'],
  );
  assert.equal(finding.evidence[0].delta, 63);
});

test('thresholds are options and invalid options are rejected with E_BAD_OPTION', () => {
  const rows = makeRows(24, (i) => ({ heapUsed: 10 + 0.1 * i }));
  assert.deepEqual(
    analyze(rows).findings.map((f) => f.kind),
    ['none'],
  );
  assert.deepEqual(
    analyze(rows, { minGrowthMB: 1, minRelGrowth: 0.05 }).findings.map((f) => f.kind),
    ['js-heap'],
  );
  assert.throws(() => analyze(rows, { minR2: 2 }), { code: 'E_BAD_OPTION' });
  assert.throws(() => analyze(rows, { windows: 1 }), { code: 'E_BAD_OPTION' });
});

test('empty and tiny inputs give insufficient-data instead of throwing', () => {
  assert.equal(analyze([]).findings[0].kind, 'insufficient-data');
  assert.equal(analyze(makeRows(5, () => ({}))).findings[0].kind, 'insufficient-data');
});

test('arrayBuffers of 0 (embedded runtimes) falls back to external only', () => {
  const rows = makeRows(24, (i) => ({ external: 4 + 2 * i, arrayBuffers: 0 }));
  const finding = analyze(rows).findings[0];
  assert.equal(finding.kind, 'native-buffer');
  assert.deepEqual(
    finding.evidence.filter((e) => e.role === 'grew').map((e) => e.metric),
    ['external'],
  );
});

test('multi-pid input warns and analyzes the last process; --pid selects another', async () => {
  const last = await readJsonl(fixture('multi-pid.jsonl'));
  assert.equal(last.rows[0].pid, 2222);
  assert.equal(last.warnings[0].code, 'W_MULTIPLE_PIDS');
  const first = await readJsonl(fixture('multi-pid.jsonl'), { pid: 1111 });
  assert.equal(first.rows[0].pid, 1111);
  assert.deepEqual(
    analyze(first.rows).findings.map((f) => f.kind),
    ['none'],
  );
  await assert.rejects(readJsonl(fixture('multi-pid.jsonl'), { pid: 9 }), { code: 'E_BAD_OPTION' });
});

test('mixed Node versions produce a warning', async () => {
  const { dirname, join } = await import('node:path');
  const { writeFileSync } = await import('node:fs');
  const { makeTmp } = await import('./helpers.mjs');
  const tmp = makeTmp();
  try {
    const a = makeRows(3, () => ({}), { pid: 1, node: 'v20.1.0' });
    const b = makeRows(3, () => ({}), { pid: 1, node: 'v22.1.0', intervalMs: 61_000 });
    const file = join(tmp.dir, 'mix.jsonl');
    writeFileSync(file, [...a, ...b].map((r) => JSON.stringify(r)).join('\n'));
    const { warnings } = await readJsonl(file);
    assert.deepEqual(
      warnings.map((w) => w.code),
      ['W_MIXED_NODE'],
    );
    assert.equal(dirname(file), tmp.dir);
  } finally {
    tmp.cleanup();
  }
});

test('rotated files are merged in time order and duplicates are dropped', async () => {
  const { join } = await import('node:path');
  const { writeFileSync } = await import('node:fs');
  const { makeTmp } = await import('./helpers.mjs');
  const tmp = makeTmp();
  try {
    const rows = makeRows(12, () => ({}));
    const old = join(tmp.dir, 'mem.jsonl.1');
    const cur = join(tmp.dir, 'mem.jsonl');
    writeFileSync(old, rows.slice(0, 7).map((r) => JSON.stringify(r)).join('\n') + '\n');
    writeFileSync(cur, rows.slice(5).map((r) => JSON.stringify(r)).join('\n') + '\n'); // overlaps rows 5-6
    const merged = await readJsonl([cur, old]);
    assert.equal(merged.rows.length, 12);
    assert.deepEqual(
      merged.rows.map((r) => r.t),
      rows.map((r) => r.t),
    );
  } finally {
    tmp.cleanup();
  }
});
