// Generates synthetic, known-truth time series (seeded PRNG, so the output is deterministic).
// Writes test/fixtures/*.jsonl + expected.json, and copies a few into examples/samples/.
// Run: node scripts/gen-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MiB = 1024 * 1024;
const T0 = 1_700_000_000_000;
const STEP_MS = 60_000;

// mulberry32: tiny seeded PRNG
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build n rows. `shape(i)` returns offsets in MiB over the baseline; GC-like noise is never negative,
// so the lower envelope of every series is exactly the shape.
function series({ n, seed, pid = 4242, node = 'v22.12.0', startRow = 0, shape }) {
  const rand = prng(seed);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const s = shape(i);
    const noise = () => rand() * 0.2;
    const heapUsed = 25 + (s.heap ?? 0) + (s.saw ?? 0) + noise();
    const external = 4 + (s.external ?? 0) + noise();
    const arrayBuffers = 1 + (s.arrayBuffers ?? s.external ?? 0) + noise() / 2;
    rows.push({
      v: 1,
      t: T0 + (startRow + i) * STEP_MS,
      pid,
      threadId: 0,
      node,
      rss: Math.round((80 + (s.rss ?? 0) + (s.saw ?? 0) * 0.5 + noise()) * MiB),
      heapTotal: Math.round((heapUsed + 15) * MiB),
      heapUsed: Math.round(heapUsed * MiB),
      external: Math.round(external * MiB),
      arrayBuffers: Math.round(arrayBuffers * MiB),
      resources: { PipeWrap: 1, TCPServerWrap: 1, ...(s.resources ?? {}) },
    });
  }
  return rows;
}

const saw = (i, amplitude) => (i % 5) * (amplitude / 4); // 0 at i%5==0: the floor stays flat
const stairs = (i) => 8 * Math.floor(i / 6); // external +8 MiB every 6 rows

const fixtures = {
  'js-heap.jsonl': {
    expected: { kinds: ['js-heap'], warnings: [] },
    rows: series({ n: 60, seed: 1, shape: (i) => ({ heap: 0.5 * i, rss: 0.5 * i, saw: saw(i, 2) }) }),
  },
  'native-buffer.jsonl': {
    expected: { kinds: ['native-buffer'], warnings: [] },
    rows: series({
      n: 60,
      seed: 2,
      shape: (i) => ({
        external: stairs(i),
        arrayBuffers: 8 * Math.floor(Math.max(0, i - 2) / 6), // arrayBuffers follows 2 rows later
        rss: stairs(i),
      }),
    }),
  },
  'handles.jsonl': {
    expected: { kinds: ['handles'], warnings: [] },
    rows: series({
      n: 60,
      seed: 3,
      shape: (i) => ({ resources: { Timeout: 20 * i, TCPSocketWrap: 5 * i } }),
    }),
  },
  'allocator.jsonl': {
    expected: { kinds: ['allocator-retention'], warnings: [] },
    rows: series({
      n: 60,
      seed: 4,
      shape: (i) => ({
        // allocate during rows 10..29, then everything is freed again
        heap: i >= 10 && i < 30 ? 40 : 0,
        external: i >= 10 && i < 30 ? 20 : 0,
        // rss climbs in steps and never comes back
        rss: i < 10 ? 0 : i < 20 ? 30 : i < 30 ? 60 : 90,
      }),
    }),
  },
  'sawtooth-flat.jsonl': {
    expected: { kinds: ['none'], warnings: [] },
    rows: series({ n: 60, seed: 5, shape: (i) => ({ saw: saw(i, 20) }) }),
  },
  'mixed.jsonl': {
    expected: { kinds: ['native-buffer', 'handles'], warnings: [] },
    rows: series({
      n: 60,
      seed: 6,
      shape: (i) => ({ external: stairs(i), rss: stairs(i), resources: { Timeout: 2 * i } }),
    }),
  },
  'short.jsonl': {
    expected: { kinds: ['insufficient-data'], warnings: [] },
    rows: series({ n: 4, seed: 7, shape: () => ({}) }),
  },
  'multi-pid.jsonl': {
    expected: { kinds: ['native-buffer'], warnings: ['W_MULTIPLE_PIDS'] },
    rows: [
      ...series({ n: 30, seed: 8, pid: 1111, shape: () => ({}) }),
      ...series({
        n: 30,
        seed: 9,
        pid: 2222,
        startRow: 30,
        shape: (i) => ({ external: 3 * i, rss: 3 * i }),
      }),
    ],
  },
};

const fixtureDir = join(root, 'test', 'fixtures');
const sampleDir = join(root, 'examples', 'samples');
mkdirSync(fixtureDir, { recursive: true });
mkdirSync(sampleDir, { recursive: true });

const expected = {};
for (const [name, { rows, expected: truth }] of Object.entries(fixtures)) {
  const text = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  writeFileSync(join(fixtureDir, name), text);
  expected[name] = truth;
}
writeFileSync(join(fixtureDir, 'expected.json'), JSON.stringify(expected, null, 2) + '\n');

// Sample logs for the README: copies of fixtures with friendlier names.
for (const name of ['js-heap', 'native-buffer', 'handles', 'allocator', 'mixed']) {
  const text = fixtures[name + '.jsonl'].rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  writeFileSync(join(sampleDir, name + '.jsonl'), text);
}
console.log('fixtures written: ' + Object.keys(fixtures).length);
