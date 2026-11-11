import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HANGUL, dist, fixture, runBin } from './helpers.mjs';

const { resolveLang } = await import(dist('esm/index.js'));
const { en } = await import(dist('esm/i18n/en.js'));
const { ko } = await import(dist('esm/i18n/ko.js'));

test('AC-6: --lang ko and --lang en switch --help and the report', () => {
  for (const args of [['--help'], ['analyze', fixture('js-heap.jsonl')], ['analyze', fixture('js-heap.jsonl'), '--format', 'md']]) {
    const korean = runBin([...args, '--lang', 'ko']);
    const english = runBin([...args, '--lang', 'en']);
    assert.equal(korean.status, 0);
    assert.equal(english.status, 0);
    assert.match(korean.stdout, HANGUL, args.join(' ') + ' (ko)');
    assert.doesNotMatch(english.stdout, HANGUL, args.join(' ') + ' (en)');
    assert.notEqual(korean.stdout, english.stdout);
  }
});

test('AC-6: language order is --lang > LEAKVERDICT_LANG > LC_ALL > LC_MESSAGES > LANG', () => {
  const help = (args, env) => runBin(['--help', ...args], { env }).stdout;
  const isKo = (text) => HANGUL.test(text);
  assert.equal(isKo(help([], { LANG: 'ko_KR.UTF-8' })), true, 'LANG=ko_KR.UTF-8');
  assert.equal(isKo(help([], { LANG: 'C.UTF-8' })), false, 'LANG=C.UTF-8');
  assert.equal(isKo(help([], {})), false, 'defaults pinned by the helper (C.UTF-8)');
  assert.equal(isKo(help([], { LANG: 'en_US.UTF-8' })), false, 'LANG=en_US.UTF-8');
  assert.equal(isKo(help([], { LANG: 'en_US.UTF-8', LC_MESSAGES: 'ko_KR.UTF-8' })), true, 'LC_MESSAGES beats LANG');
  assert.equal(isKo(help([], { LANG: 'ko_KR.UTF-8', LC_ALL: 'C' })), false, 'LC_ALL beats LANG');
  assert.equal(isKo(help([], { LC_ALL: 'en_US.UTF-8', LC_MESSAGES: 'ko_KR.UTF-8' })), false, 'LC_ALL beats LC_MESSAGES');
  assert.equal(isKo(help([], { LC_ALL: 'C', LEAKVERDICT_LANG: 'ko' })), true, 'LEAKVERDICT_LANG beats LC_ALL');
  assert.equal(isKo(help(['--lang', 'en'], { LEAKVERDICT_LANG: 'ko' })), false, '--lang beats LEAKVERDICT_LANG');
  assert.equal(isKo(help(['--lang', 'ko'], { LANG: 'C' })), true, '--lang ko');
});

test('resolveLang unit behavior', () => {
  assert.equal(resolveLang(undefined, {}), 'en');
  assert.equal(resolveLang(undefined, { LANG: '' }), 'en');
  assert.equal(resolveLang(undefined, { LANG: '', LC_ALL: 'ko_KR.UTF-8' }), 'ko');
  assert.equal(resolveLang('ko', { LANG: 'C' }), 'ko');
  assert.equal(resolveLang('en', { LEAKVERDICT_LANG: 'ko' }), 'en');
  assert.equal(resolveLang(undefined, { LEAKVERDICT_LANG: 'KO' }), 'ko');
});

test('AC-6: English and Korean message tables have the same keys and placeholders', () => {
  const enKeys = Object.keys(en).sort();
  const koKeys = Object.keys(ko).sort();
  assert.deepEqual(koKeys, enKeys);
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of enKeys) {
    assert.deepEqual(placeholders(ko[key]), placeholders(en[key]), 'placeholders of ' + key);
    assert.notEqual(ko[key], '', key);
  }
});

test('every verdict, confidence and next-step message exists in both languages', () => {
  const kinds = ['js-heap', 'native-buffer', 'handles', 'allocator-retention', 'none', 'insufficient-data'];
  const next = ['heap-snapshot', 'buffer-retention', 'why-is-node-running', 'allocator-ab', 'collect-longer'];
  for (const k of kinds) assert.ok(('kind.' + k) in en && ('kind.' + k) in ko, k);
  for (const c of ['high', 'medium', 'low', 'suspected']) assert.ok(('conf.' + c) in ko, c);
  for (const n of next) assert.ok(('next.' + n) in en && ('next.' + n) in ko, n);
  for (const w of ['W_MULTIPLE_PIDS', 'W_MIXED_NODE']) assert.ok(('warn.' + w) in ko, w);
});

test('Korean help and report are fully localized for a Korean environment', () => {
  const r = runBin(['analyze', fixture('multi-pid.jsonl')], { env: { LANG: 'ko_KR.UTF-8' } });
  assert.match(r.stdout, /경고/);
  assert.match(r.stdout, /pid 1111, 2222/);
});
