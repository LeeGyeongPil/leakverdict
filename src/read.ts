import { readFile } from 'node:fs/promises';
import { LeakverdictError } from './errors.js';
import type { Warning } from './errors.js';
import { validateRow } from './row.js';
import type { Row } from './row.js';

export interface ReadOptions {
  /** Analyze this process id when the input contains several. Default: the last one. */
  pid?: number;
  /** Replace the file reader (used by tests to inject errors). */
  readFile?: (path: string) => Promise<string>;
}

export interface ReadResult {
  rows: Row[];
  warnings: Warning[];
}

function mapFsError(e: unknown, path: string): LeakverdictError {
  const code = (e as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT') return new LeakverdictError('E_FILE_NOT_FOUND', { path });
  if (code === 'EISDIR') return new LeakverdictError('E_IS_DIRECTORY', { path });
  const reason = typeof code === 'string' ? code : String((e as Error)?.message ?? e);
  return new LeakverdictError('E_FILE_ACCESS', { path, reason });
}

/** Read one or more JSONL files (rotated copies included), merge, sort by time, drop duplicates. */
export async function readJsonl(paths: string | string[], opts: ReadOptions = {}): Promise<ReadResult> {
  const list = Array.isArray(paths) ? paths : [paths];
  if (list.length === 0) {
    throw new LeakverdictError('E_NO_FILES');
  }
  const read = opts.readFile ?? ((p: string) => readFile(p, 'utf8'));

  const all: Row[] = [];
  for (const path of list) {
    let text: string;
    try {
      text = await read(path);
    } catch (e) {
      throw mapFsError(e, path);
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = (lines[i] ?? '').trim();
      if (line === '') continue;
      const lineNo = i + 1;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (e) {
        throw new LeakverdictError('E_PARSE', { path, line: lineNo, reason: (e as Error).message });
      }
      try {
        all.push(validateRow(parsed));
      } catch (e) {
        if (e instanceof LeakverdictError && e.code === 'E_SCHEMA') {
          throw new LeakverdictError('E_SCHEMA', {
            ...e.params,
            where: path + ':' + lineNo,
            path,
            line: lineNo,
          });
        }
        throw e;
      }
    }
  }
  if (all.length === 0) {
    throw new LeakverdictError('E_EMPTY_INPUT', { path: list.join(', ') });
  }

  // Sort by time, then drop exact duplicates (the same row read from overlapping files).
  all.sort((a, b) => a.t - b.t);
  const seen = new Set<string>();
  const rows = all.filter((r) => {
    const id = r.pid + ':' + r.threadId + ':' + r.t;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const warnings: Warning[] = [];
  const versions = [...new Set(rows.map((r) => r.node))];
  const pids = [...new Set(rows.map((r) => r.pid))];
  let used = rows[rows.length - 1]!.pid;

  if (opts.pid !== undefined) {
    if (!pids.includes(opts.pid)) {
      throw new LeakverdictError('E_BAD_OPTION', {
        option: '--pid',
        value: opts.pid,
        expected: 'pid-in-input',
        list: pids.join(', '),
      });
    }
    used = opts.pid;
  }
  if (pids.length > 1) {
    warnings.push({ code: 'W_MULTIPLE_PIDS', params: { pids: pids.join(', '), used } });
  }
  if (versions.length > 1) {
    warnings.push({ code: 'W_MIXED_NODE', params: { versions: versions.join(', ') } });
  }
  return { rows: rows.filter((r) => r.pid === used), warnings };
}
