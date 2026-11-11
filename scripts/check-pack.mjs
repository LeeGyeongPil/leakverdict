// Package check: copy the repo to a temp folder WITHOUT package scripts (so no prepare/build step
// can touch dist while tests run), npm pack it, install the tarball into another temp folder and
// use it through ESM, CJS and the bin. The repo folder itself is never written to.
// Run after `npm run build`:  node scripts/check-pack.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 240_000 });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${r.status}): ${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

function gitStatus() {
  const r = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout : null;
}

if (!existsSync(join(root, 'dist', 'esm', 'index.js'))) {
  console.error('dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}

const before = gitStatus();
const tmp = mkdtempSync(join(tmpdir(), 'leakverdict-pack-'));
try {
  // 1. temp copy without node_modules/.git, and without scripts in package.json
  const copy = join(tmp, 'pkg');
  cpSync(root, copy, {
    recursive: true,
    filter: (src) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(src.slice(root.length)),
  });
  const manifestPath = join(copy, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  delete manifest.scripts;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // 2. pack and inspect the file list
  const outDir = join(tmp, 'out');
  mkdirSync(outDir);
  const packed = JSON.parse(run(npm, ['pack', '--json', '--pack-destination', outDir], copy));
  const info = packed[0];
  const files = info.files.map((f) => f.path);
  const has = (p) => files.includes(p);
  for (const required of ['dist/esm/index.js', 'dist/esm/bin.js', 'dist/cjs/index.js', 'dist/cjs/package.json', 'dist/esm/index.d.ts', 'LICENSE', 'package.json']) {
    assert.ok(has(required), 'tarball is missing ' + required);
  }
  for (const doc of ['README.md', 'README.ko.md', 'CHANGELOG.md']) {
    if (existsSync(join(root, doc))) assert.ok(has(doc), 'tarball is missing ' + doc);
    else console.log('note: ' + doc + ' does not exist yet (not checked)');
  }
  for (const f of files) {
    assert.ok(!/^(test|scripts|\.github|src|examples)\//.test(f), 'tarball must not contain ' + f);
  }

  // 3. install the tarball elsewhere and use it
  const consumer = join(tmp, 'consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), '{"private":true,"name":"consumer"}\n');
  run(npm, ['install', '--offline', '--no-audit', '--no-fund', join(outDir, info.filename)], consumer);

  const esm = run(
    process.execPath,
    ['--input-type=module', '-e', "import { analyze, startSampler } from 'leakverdict'; console.log(typeof analyze + ',' + typeof startSampler);"],
    consumer,
  );
  assert.equal(esm.trim(), 'function,function');
  const cjs = run(
    process.execPath,
    ['-e', "const l = require('leakverdict'); console.log(typeof l.analyze + ',' + typeof l.startSampler + ',' + typeof require.resolve('leakverdict/register'));"],
    consumer,
  );
  assert.equal(cjs.trim(), 'function,function,string');
  const bin = join(consumer, 'node_modules', '.bin', 'leakverdict');
  const version = run(bin, ['--version'], consumer).trim();
  assert.equal(version, manifest.version);

  // 4. the repo folder must be unchanged
  const after = gitStatus();
  assert.equal(after, before, 'git status changed while checking the package');
  console.log(`tarball: ${files.length} files, ${info.size} bytes`);
  console.log('pack ok');
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
