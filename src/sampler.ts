import { threadId } from 'node:worker_threads';
import { LeakverdictError } from './errors.js';
import { RotatingFile } from './rotate.js';
import type { Row } from './row.js';

export interface SamplerOptions {
  /** JSONL output file. Without it, rows only live in the in-memory ring buffer. */
  file?: string;
  /** Sampling interval in milliseconds. Default 60000. */
  intervalMs?: number;
  /** Size cap per file in bytes. Default 10_000_000. */
  maxBytes?: number;
  /** Number of files kept (file, file.1, ...). Default 3. */
  maxFiles?: number;
  /** Ring buffer size for rows(). Default 1440. */
  maxRows?: number;
  /** Called when writing fails. The sampler never throws into the host application. */
  onError?: (error: LeakverdictError) => void;
}

export interface Sampler {
  /** Add to a cumulative counter that is recorded in every row (for example requests). */
  count(name: string, n?: number): void;
  /** Take a sample right now (also written to the file). */
  sampleNow(): Row;
  /** The most recent rows, at most maxRows. */
  rows(): Row[];
  /** Stop sampling. Safe to call more than once. */
  stop(): Promise<void>;
}

function positiveInt(option: string, value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new LeakverdictError('E_BAD_OPTION', {
      option,
      value: String(value),
      expected: 'positive-int',
    });
  }
  return value;
}

/** Take one sample of memory and active resource kinds. Cheap: about 1-2 microseconds for the measurement itself (measured on Node v26.13.0). */
export function sampleOnce(counters?: Record<string, number>): Row {
  const m = process.memoryUsage();
  const resources: Record<string, number> = {};
  for (const name of process.getActiveResourcesInfo()) {
    resources[name] = (resources[name] ?? 0) + 1;
  }
  const row: Row = {
    v: 1,
    t: Date.now(),
    pid: process.pid,
    threadId,
    node: process.version,
    rss: m.rss,
    heapTotal: m.heapTotal,
    heapUsed: m.heapUsed,
    external: m.external,
    arrayBuffers: m.arrayBuffers,
    resources,
  };
  if (counters && Object.keys(counters).length > 0) row.counters = { ...counters };
  return row;
}

/**
 * Start sampling. The timer is unref'd, so it never keeps the process alive and does not
 * appear in getActiveResourcesInfo(). One sample is taken immediately.
 */
export function startSampler(opts: SamplerOptions = {}): Sampler {
  const intervalMs = positiveInt('intervalMs', opts.intervalMs, 60_000);
  const maxBytes = positiveInt('maxBytes', opts.maxBytes, 10_000_000);
  const maxFiles = positiveInt('maxFiles', opts.maxFiles, 3);
  const maxRows = positiveInt('maxRows', opts.maxRows, 1440);
  if (opts.file !== undefined && (typeof opts.file !== 'string' || opts.file === '')) {
    throw new LeakverdictError('E_BAD_OPTION', {
      option: 'file',
      value: String(opts.file),
      expected: 'non-empty-path',
    });
  }

  const file = opts.file !== undefined ? new RotatingFile(opts.file, maxBytes, maxFiles) : undefined;
  const counters: Record<string, number> = {};
  const ring: Row[] = [];
  let stopped = false;

  function reportError(e: unknown): void {
    const code = (e as NodeJS.ErrnoException)?.code;
    const error = new LeakverdictError('E_WRITE', {
      path: opts.file ?? '',
      reason: typeof code === 'string' ? code : String((e as Error)?.message ?? e),
    });
    try {
      opts.onError?.(error);
    } catch {
      // A failing callback must not break the host application.
    }
  }

  function sampleNow(): Row {
    const row = sampleOnce(counters);
    if (stopped) return row;
    ring.push(row);
    if (ring.length > maxRows) ring.shift();
    if (file) {
      try {
        file.append(JSON.stringify(row) + '\n');
      } catch (e) {
        reportError(e);
      }
    }
    return row;
  }

  const timer = setInterval(sampleNow, intervalMs);
  timer.unref();
  sampleNow();

  return {
    count(name: string, n = 1): void {
      if (typeof name !== 'string' || name === '' || typeof n !== 'number' || !Number.isFinite(n)) {
        throw new LeakverdictError('E_BAD_OPTION', {
          option: 'count',
          value: String(name) + ', ' + String(n),
          expected: 'name-and-number',
        });
      }
      counters[name] = (counters[name] ?? 0) + n;
    },
    sampleNow,
    rows: () => ring.slice(),
    stop(): Promise<void> {
      stopped = true;
      clearInterval(timer);
      return Promise.resolve();
    },
  };
}
