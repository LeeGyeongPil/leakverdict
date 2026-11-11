import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { HANGUL, dist, fixture, makeRows, makeTmp, runBin, runInProcess } from './helpers.mjs';

const { LeakverdictError, readJsonl } = await import(dist('esm/index.js'));
const { ERROR_CODES } = await import(dist('esm/errors.js'));
const { en } = await import(dist('esm/i18n/en.js'));

// Check one failing CLI call in both languages: exit code 2, one readable line, no stack trace.
async function expectError(name, args, { readFile, includes = [], env = {} } = {}) {
  for (const lang of ['en', 'ko']) {
    const r = await runInProcess([...args, '--lang', lang], { readFile, env });
    const label = `${name} (${lang})`;
    assert.equal(r.code, 2, label + ': exit code');
    assert.equal(r.stdout, '', label + ': nothing on stdout');
    const lines = r.stderr.trimEnd().split('\n');
    assert.equal(lines.length, 1, label + ': one line, got ' + r.stderr);
    assert.doesNotMatch(r.stderr, /\n\s+at |Error:|undefined|\{\w+\}/, label + ': no stack or raw placeholders');
    assert.ok(r.stderr.startsWith(lang === 'ko' ? 'leakverdict: 오류:' : 'leakverdict: error:'), label + ': prefix');
    if (lang === 'ko') assert.match(r.stderr, HANGUL, label + ': Korean text');
    else assert.doesNotMatch(r.stderr, HANGUL, label + ': English text');
    for (const part of includes) assert.ok(r.stderr.includes(part), `${label}: should include ${part} in ${r.stderr}`);
  }
}

test('AC-7: library errors carry code and params', async () => {
  await assert.rejects(readJsonl('/definitely/missing.jsonl'), (e) => {
    assert.ok(e instanceof LeakverdictError);
    assert.equal(e.code, 'E_FILE_NOT_FOUND');
    assert.equal(e.params.path, '/definitely/missing.jsonl');
    assert.match(e.message, /File not found/); // English message for library users
    return true;
  });
});

test('AC-7: E_FILE_NOT_FOUND (ENOENT)', async () => {
  await expectError('missing file', ['analyze', '/definitely/missing.jsonl'], {
    includes: ['/definitely/missing.jsonl'],
  });
});

test('AC-7: E_IS_DIRECTORY (EISDIR)', async () => {
  const tmp = makeTmp();
  try {
    await expectError('directory', ['analyze', tmp.dir], { includes: [tmp.dir] });
  } finally {
    tmp.cleanup();
  }
});

test('AC-7: E_FILE_ACCESS (EACCES injected, works as root too)', async () => {
  const readFile = async (path) => {
    const e = new Error('EACCES: permission denied, open ' + path);
    e.code = 'EACCES';
    throw e;
  };
  await expectError('permission', ['analyze', 'app-log.jsonl'], { readFile, includes: ['app-log.jsonl', 'EACCES'] });
});

test('AC-7: E_EMPTY_INPUT', async () => {
  const tmp = makeTmp();
  try {
    const file = join(tmp.dir, 'empty.jsonl');
    writeFileSync(file, '\n  \n');
    await expectError('empty', ['analyze', file], { includes: [file] });
  } finally {
    tmp.cleanup();
  }
});

test('AC-7: E_PARSE names the line number', async () => {
  const tmp = makeTmp();
  try {
    const file = join(tmp.dir, 'bad.jsonl');
    const rows = makeRows(2, () => ({})).map((r) => JSON.stringify(r));
    writeFileSync(file, [...rows, '{"v":1,'].join('\n') + '\n');
    await expectError('parse', ['analyze', file], { includes: [file + ':3'] });
  } finally {
    tmp.cleanup();
  }
});

test('AC-7: E_SCHEMA names the line number and the field', async () => {
  const tmp = makeTmp();
  try {
    const file = join(tmp.dir, 'schema.jsonl');
    const [good, bad] = makeRows(2, () => ({})).map((r) => ({ ...r }));
    delete bad.heapUsed;
    writeFileSync(file, JSON.stringify(good) + '\n' + JSON.stringify(bad) + '\n');
    await expectError('schema', ['analyze', file], { includes: [file + ':2', 'heapUsed'] });
  } finally {
    tmp.cleanup();
  }
});

test('AC-7: E_BAD_OPTION (format, fail-on, number, unknown option, no files, unknown command, lang)', async () => {
  const f = fixture('js-heap.jsonl');
  await expectError('format', ['analyze', f, '--format', 'xml'], { includes: ['--format', 'xml'] });
  await expectError('fail-on', ['analyze', f, '--fail-on', 'bogus'], { includes: ['bogus'] });
  await expectError('number', ['analyze', f, '--min-r2', '7'], { includes: ['--min-r2'] });
  await expectError('unknown option', ['analyze', f, '--nope'], { includes: ['--nope'] });
  await expectError('no files', ['analyze'], { includes: ['JSONL'] });
  await expectError('command', ['frobnicate'], { includes: ['frobnicate'] });
  const bad = await runInProcess(['--help', '--lang', 'fr']);
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /--lang/);
});

test('AC-7: E_UNKNOWN_SCENARIO lists the choices', async () => {
  await expectError('scenario', ['simulate', 'nope'], { includes: ['nope', 'buffer'] });
});

test('AC-7: E_WRITE when --out is a directory', async () => {
  const tmp = makeTmp();
  try {
    await expectError('write', ['simulate', 'buffer', '--out', tmp.dir], { includes: [tmp.dir] });
  } finally {
    tmp.cleanup();
  }
});

test('AC-7: E_SIMULATE_FAILED and every error code render in both languages', async () => {
  const { t } = await import(dist('esm/i18n/index.js'));
  const params = {
    path: '/p/f.jsonl',
    reason: 'EIO',
    line: 3,
    where: '/p/f.jsonl:3',
    field: 'rss',
    expected: 'epoch-ms',
    list: 'a, b',
    option: '--x',
    value: 'y',
    name: 'z',
    choices: 'a, b',
    scenario: 'buffer',
  };
  assert.equal(ERROR_CODES.length, 13);
  for (const code of ERROR_CODES) {
    assert.ok(('err.' + code) in en, code);
    const error = new LeakverdictError(code, params);
    for (const lang of ['en', 'ko']) {
      const text = t(lang, 'err.' + error.code, error.params);
      assert.doesNotMatch(text, /\{\w+\}/, `${code} (${lang}) has unfilled placeholders`);
      assert.ok(text.length > 20);
      if (lang === 'ko') assert.match(text, HANGUL);
    }
  }
});

test('real CLI run: missing file prints one line and exit code 2 in a Korean environment', () => {
  const r = runBin(['analyze', '/definitely/missing.jsonl'], { env: { LANG: 'ko_KR.UTF-8' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^leakverdict: 오류: 파일을 찾을 수 없습니다/);
  assert.doesNotMatch(r.stderr, /\n\s+at /);
});
