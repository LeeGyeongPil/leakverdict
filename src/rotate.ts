import { appendFileSync, existsSync, renameSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Append-only text file with a size cap and a bounded number of rotated copies:
 * file -> file.1 -> file.2 ... Oldest copy is deleted. Throws raw fs errors.
 */
export class RotatingFile {
  private size: number | undefined;

  constructor(
    private readonly path: string,
    private readonly maxBytes: number,
    private readonly maxFiles: number,
  ) {}

  append(line: string): void {
    if (this.size === undefined) {
      mkdirSync(dirname(this.path), { recursive: true });
      try {
        this.size = statSync(this.path).size;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        this.size = 0;
      }
    }
    const len = Buffer.byteLength(line);
    if (this.size > 0 && this.size + len > this.maxBytes) this.rotate();
    appendFileSync(this.path, line);
    this.size += len;
  }

  private rotate(): void {
    if (this.maxFiles <= 1) {
      writeFileSync(this.path, '');
    } else {
      rmSync(`${this.path}.${this.maxFiles - 1}`, { force: true });
      for (let i = this.maxFiles - 2; i >= 1; i--) {
        if (existsSync(`${this.path}.${i}`)) renameSync(`${this.path}.${i}`, `${this.path}.${i + 1}`);
      }
      if (existsSync(this.path)) renameSync(this.path, `${this.path}.1`);
    }
    this.size = 0;
  }
}
