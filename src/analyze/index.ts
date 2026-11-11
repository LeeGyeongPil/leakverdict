import { LeakverdictError } from '../errors.js';
import type { Warning } from '../errors.js';
import type { Row } from '../row.js';
import { DEFAULT_THRESHOLDS, evaluate } from './rules.js';
import type { Finding } from './rules.js';

export type {
  Confidence,
  Evidence,
  Finding,
  NextStepCode,
  VerdictKind,
} from './rules.js';

export interface AnalyzeOptions {
  /** Number of envelope windows. Default 8 (at most half the number of rows). */
  windows?: number;
  /** Minimum rows for a verdict. Default 6. */
  minSamples?: number;
  /** Minimum absolute growth in MB for memory metrics. Default 5. */
  minGrowthMB?: number;
  /** Minimum growth relative to the starting level. Default 0.1. */
  minRelGrowth?: number;
  /** Minimum growth in count for one resource kind. Default 10. */
  minHandleGrowth?: number;
  /** Minimum R2 of the envelope fit. Default 0.5. */
  minR2?: number;
}

export interface Report {
  version: 1;
  span: { from: number; to: number; samples: number; pid: number; node: string };
  findings: Finding[];
  warnings: Warning[];
}

function check(option: string, value: number | undefined, ok: (n: number) => boolean, expected: string): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || !ok(value)) {
    throw new LeakverdictError('E_BAD_OPTION', { option, value: String(value), expected });
  }
}

/** Analyze rows of one process. Pure function: same rows and options always give the same report. */
export function analyze(rows: readonly Row[], opts: AnalyzeOptions = {}): Report {
  check('windows', opts.windows, (n) => Number.isInteger(n) && n >= 3, 'int-min-3');
  check('minSamples', opts.minSamples, (n) => Number.isInteger(n) && n >= 3, 'int-min-3');
  check('minGrowthMB', opts.minGrowthMB, (n) => n >= 0, 'number-min-0');
  check('minRelGrowth', opts.minRelGrowth, (n) => n >= 0, 'number-min-0');
  check('minHandleGrowth', opts.minHandleGrowth, (n) => n >= 1, 'number-min-1');
  check('minR2', opts.minR2, (n) => n >= 0 && n <= 1, 'number-0-1');

  const th = { ...DEFAULT_THRESHOLDS };
  for (const key of Object.keys(th) as (keyof typeof th)[]) {
    const v = opts[key];
    if (v !== undefined) th[key] = v;
  }

  const sorted = [...rows].sort((a, b) => a.t - b.t);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return {
    version: 1,
    span: {
      from: first?.t ?? 0,
      to: last?.t ?? 0,
      samples: sorted.length,
      pid: last?.pid ?? 0,
      node: last?.node ?? '',
    },
    findings: evaluate(sorted, th),
    warnings: [],
  };
}
