import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cleanEnv, root } from './helpers.mjs';

test('AC-8: node scripts/check-pack.mjs prints "pack ok"', () => {
  const r = spawnSync(process.execPath, [join(root, 'scripts', 'check-pack.mjs')], {
    cwd: root,
    encoding: 'utf8',
    timeout: 300_000,
    env: cleanEnv(),
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(r.stdout.trim().split('\n').pop(), 'pack ok');
});

test('AC-9: no node --test glob patterns in scripts or package.json; CI covers Node 20, 22, 24', () => {
  const sources = [
    readFileSync(join(root, 'scripts', 'run-tests.mjs'), 'utf8').replace(/^\/\/.*$/gm, ''),
    readFileSync(join(root, 'package.json'), 'utf8'),
  ];
  for (const text of sources) {
    assert.doesNotMatch(text, /--test[^\n]*[*?]/, 'a glob argument was passed to node --test');
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.engines.node, '>=20');
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0, 'zero runtime dependencies');
  const ci = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(ci, /node-version:\s*\[\s*20\s*,\s*22\s*,\s*24\s*\]/);
});
