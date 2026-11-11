// Regression tests for QA round 1 (Q-1 localized option errors, Q-2 per-process files, Q-3 big heaps, Q-8 env errors).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cleanEnv, dist, fixture, makeRows, makeTmp, runInProcess } from './helpers.mjs';

// ---------- Q-1: Korean errors contain no English sentence fragments ----------

const ENGLISH_WORDS = /\b(a|an|the|of|or|at|least|one|number|integer|valid|between|expected|invalid|process|file|files)\b/i;

async function koError(args, { readFile, strip = [] } = {}) {
  const r = await runInProcess([...args, '--lang', 'ko'], { readFile });
  assert.equal(r.code, 2, r.stderr);
  let text = r.stderr.replace(/^leakverdict: 오류:/, '');
  for (const s of strip) text = text.split(s).join('');
  text = text.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''").replace(/--[\w-]+/g, '');
  assert.doesNotMatch(text, ENGLISH_WORDS, 'English left in Korean error: ' + r.stderr);
  return r.stderr;
}

test('Q-1: Korean option errors contain no English sentence parts', async () => {
  const f = fixture('js-heap.jsonl');
  await koError(['analyze', f, '--format', 'xml']);
  await koError(['analyze', f, '--fail-on', 'bogus']);
  await koError(['analyze', f, '--fail-on', ',']);
  await koError(['analyze', f, '--min-r2', '7']);
  await koError(['analyze', f, '--min-samples', '1']);
  await koError(['analyze', f, '--min-growth-mb', '-1']);
  await koError(['analyze', f, '--min-rel-growth', '-1']);
  await koError(['analyze', f, '--pid', 'x']);
  await koError(['analyze', f, '--pid', '99999']);
  await koError(['simulate', 'buffer', '--steps', '2']);
  await koError(['simulate', 'buffer', '--interval-ms', '0']);
  await koError(['analyze', f, '--bogus']);
  await koError(['analyze', f, '--format']);
  await koError(['analyze']);
  await koError(['frob']);
});

test('Q-1: Korean schema errors are Korean too', async () => {
  const tmp = makeTmp();
  try {
    const file = join(tmp.dir, 's.jsonl');
    const base = makeRows(1, () => ({}))[0];
    const cases = [
      { ...base, t: 'x' },
      { ...base, pid: -1 },
      { ...base, node: '' },
      { ...base, rss: 'big' },
      { ...base, v: 2 },
      { ...base, resources: 5 },
      { ...base, resources: { timer: -1 } },
      { ...base, counters: { n: 'x' } },
    ];
    for (const c of cases) {
      writeFileSync(file, JSON.stringify(c) + '\n');
      await koError(['analyze', file], { strip: [file] });
    }
    writeFileSync(file, '[1]\n');
    await koError(['analyze', file], { strip: [file] });
  } finally {
    tmp.cleanup();
  }
});

test('Q-1: unknown option and missing value have their own messages (en and ko)', async () => {
  const f = fixture('js-heap.jsonl');
  const argv = ['analyze', f, '--bogus'];
  const en = await runInProcess([...argv, '--lang', 'en']);
  assert.match(en.stderr, /Unknown option --bogus/);
  assert.doesNotMatch(en.stderr, /Invalid value/);
  assert.ok(!en.stderr.includes(f), 'must not echo the whole command line');
  const ko = await runInProcess([...argv, '--lang', 'ko']);
  assert.match(ko.stderr, /알 수 없는 옵션 --bogus/);
  assert.ok(!ko.stderr.includes(f));

  const miss = await runInProcess(['analyze', f, '--format', '--lang', 'en']);
  assert.match(miss.stderr, /--format.*needs a value/);
  const missKo = await runInProcess(['analyze', f, '--format', '--lang', 'ko']);
  assert.match(missKo.stderr, /--format.*값이 필요합니다/);

  const none = await runInProcess(['analyze', '--lang', 'en']);
  assert.match(none.stderr, /at least one JSONL file/);
  assert.match(none.stderr, /leakverdict analyze/);
  const noneKo = await runInProcess(['analyze', '--lang', 'ko']);
  assert.match(noneKo.stderr, /JSONL 파일을 하나 이상/);
});

// ---------- Q-3: big heaps ----------

function bigHeapFile(tmp) {
  // 1500 MB heap growing 120 MB over 59 minutes (about 120 MB/h), rss 2x.
  const rows = makeRows(60, (i) => ({ heapUsed: 1500 + (i * 120) / 59, heapTotal: 2000 + i * 2, rss: 3000 + (i * 150) / 59 }));
  const file = join(tmp.dir, 'big.jsonl');
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return file;
}

function verdictOf(args) {
  return runInProcess([...args, '--format', 'json']).then((r) => {
    assert.equal(r.code, 0, r.stderr);
    return JSON.parse(r.stdout).findings[0].kind;
  });
}

test('Q-3: 1.5 GB heap growing 120 MB/h is found when thresholds are lowered from the CLI', async () => {
  const tmp = makeTmp();
  try {
    const file = bigHeapFile(tmp);
    assert.equal(await verdictOf(['analyze', file]), 'none'); // default 10% relative threshold hides it
    assert.equal(await verdictOf(['analyze', file, '--min-rel-growth', '0']), 'js-heap');
    // --min-growth-mb given on its own now takes over from the relative threshold (it used to have no effect).
    assert.equal(await verdictOf(['analyze', file, '--min-growth-mb', '50']), 'js-heap');
    assert.equal(await verdictOf(['analyze', file, '--min-growth-mb', '0']), 'js-heap');
    // a high absolute threshold still hides it
    assert.equal(await verdictOf(['analyze', file, '--min-growth-mb', '500']), 'none');
  } finally {
    tmp.cleanup();
  }
});

test('Q-3: --min-rel-growth is validated and documented in both languages', async () => {
  const f = fixture('js-heap.jsonl');
  const bad = await runInProcess(['analyze', f, '--min-rel-growth', 'abc', '--lang', 'en']);
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /--min-rel-growth/);
  for (const lang of ['en', 'ko']) {
    const h = await runInProcess(['--help', '--lang', lang]);
    assert.match(h.stdout, /--min-rel-growth/);
  }
});

// ---------- Q-2 / Q-8: register ----------

const REGISTER = dist('esm/register.js');

test('Q-2: several processes write separate files, each within the size cap', () => {
  const tmp = makeTmp();
  try {
    const app = join(tmp.dir, 'app.mjs');
    writeFileSync(
      app,
      [
        "import cluster from 'node:cluster';",
        "if (cluster.isPrimary) {",
        "  cluster.fork(); cluster.fork();",
        "  let n = 0;",
        "  cluster.on('exit', () => { if (++n === 2) process.exit(0); });",
        "  setTimeout(() => {}, 600);",
        "} else {",
        "  setTimeout(() => process.exit(0), 600);",
        "}",
        '',
      ].join('\n'),
    );
    const result = spawnSync(process.execPath, ['--import', REGISTER, app], {
      cwd: tmp.dir,
      encoding: 'utf8',
      timeout: 30_000,
      env: cleanEnv({ LEAKVERDICT_INTERVAL_MS: '20', LEAKVERDICT_MAX_BYTES: '3000' }),
    });
    assert.equal(result.status, 0, result.stderr);
    const files = readdirSync(tmp.dir).filter((n) => n.startsWith('leakverdict'));
    const pids = new Set();
    for (const name of files) {
      const m = /^leakverdict-(\d+)\.jsonl(\.\d+)?$/.exec(name);
      assert.ok(m, 'unexpected file name ' + name);
      pids.add(m[1]);
      assert.ok(statSync(join(tmp.dir, name)).size <= 3000, name + ' exceeds the cap');
      for (const line of readFileSync(join(tmp.dir, name), 'utf8').split('\n').filter(Boolean)) {
        assert.equal(String(JSON.parse(line).pid), m[1], 'rows of another process in ' + name);
      }
    }
    assert.equal(pids.size, 3, 'primary + 2 workers, got ' + [...pids]);
  } finally {
    tmp.cleanup();
  }
});

test('Q-2: {pid} in LEAKVERDICT_FILE is expanded', () => {
  const tmp = makeTmp();
  try {
    const app = join(tmp.dir, 'app.mjs');
    writeFileSync(app, 'setTimeout(() => {}, 100);\n');
    const result = spawnSync(process.execPath, ['--import', REGISTER, app], {
      cwd: tmp.dir,
      encoding: 'utf8',
      timeout: 30_000,
      env: cleanEnv({ LEAKVERDICT_FILE: join(tmp.dir, 'mem-{pid}.jsonl'), LEAKVERDICT_INTERVAL_MS: '20' }),
    });
    assert.equal(result.status, 0, result.stderr);
    const files = readdirSync(tmp.dir).filter((n) => n.startsWith('mem-'));
    assert.equal(files.length, 1);
    assert.match(files[0], /^mem-\d+\.jsonl$/);
  } finally {
    tmp.cleanup();
  }
});

test('Q-8: a bad environment variable is named in the warning', () => {
  const tmp = makeTmp();
  try {
    const app = join(tmp.dir, 'app.mjs');
    writeFileSync(app, "console.log('ok');\n");
    const result = spawnSync(process.execPath, ['--import', REGISTER, app], {
      cwd: tmp.dir,
      encoding: 'utf8',
      timeout: 30_000,
      env: cleanEnv({ LEAKVERDICT_INTERVAL_MS: 'abc' }),
    });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /LEAKVERDICT_INTERVAL_MS="abc" is not a positive integer; sampler not started/);
  } finally {
    tmp.cleanup();
  }
});
