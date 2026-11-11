// Clean build: ESM + CJS output, then mark dist/cjs as CommonJS.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');

rmSync(join(root, 'dist'), { recursive: true, force: true });
for (const project of ['tsconfig.esm.json', 'tsconfig.cjs.json']) {
  const result = spawnSync(process.execPath, [tsc, '-p', join(root, project)], { stdio: 'inherit', cwd: root });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
mkdirSync(join(root, 'dist', 'cjs'), { recursive: true });
writeFileSync(join(root, 'dist', 'cjs', 'package.json'), '{"type":"commonjs"}\n');
