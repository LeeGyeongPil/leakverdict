// The README shows the output of examples/sampler-basic.mjs; keep the example deterministic and the docs in sync.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cleanEnv, root } from './helpers.mjs';

const EXPECTED_FIRST = 'rows: 6';
const EXPECTED_THIRD = 'counters: {"requests":50}';

test('sampler-basic example output is stable and matches README en/ko', () => {
  for (let i = 0; i < 5; i++) {
    const r = spawnSync(process.execPath, ['examples/sampler-basic.mjs'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 20_000,
      killSignal: 'SIGKILL',
      env: cleanEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.equal(r.status, 0, 'run ' + i + ' exited by itself: ' + r.signal + ' ' + r.stderr);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines[0], EXPECTED_FIRST, 'run ' + i);
    assert.equal(lines[2], EXPECTED_THIRD, 'run ' + i);
  }
  // README en/ko output block must match the example
  for (const name of ['README.md', 'README.ko.md']) {
    const text = readFileSync(join(root, name), 'utf8');
    const after = text.split('node examples/sampler-basic.mjs\n')[1];
    assert.ok(after, name + ' shows the sampler-basic command');
    const block = after.match(/```text\n([\s\S]*?)```/);
    assert.ok(block, name + ' has a text output block');
    const lines = block[1].trim().split('\n');
    assert.equal(lines.length, 3, name);
    assert.equal(lines[0], EXPECTED_FIRST, name);
    assert.ok(lines[1].startsWith('last row keys:'), name);
    assert.equal(lines[2], EXPECTED_THIRD, name);
  }
});
