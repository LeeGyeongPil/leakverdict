import type { Row } from '../row.js';
import { trend } from './stats.js';
import type { Trend } from './stats.js';

export const MB = 1024 * 1024;

export type VerdictKind =
  | 'js-heap'
  | 'native-buffer'
  | 'handles'
  | 'allocator-retention'
  | 'none'
  | 'insufficient-data';

export type Confidence = 'high' | 'medium' | 'low' | 'suspected';

export type NextStepCode =
  | 'heap-snapshot'
  | 'buffer-retention'
  | 'why-is-node-running'
  | 'allocator-ab'
  | 'collect-longer';

export interface Evidence {
  /** Metric name, for example "heapUsed" or "resources.Timeout". */
  metric: string;
  unit: 'bytes' | 'count';
  /** grew: part of the verdict. flat: context showing a metric that did not grow. */
  role: 'grew' | 'flat';
  from: number;
  to: number;
  delta: number;
  /** Envelope slope per hour, in bytes (or counts). */
  slopePerHour: number;
  r2: number;
  /** Largest single jump of the envelope (bytes). Only for allocator-retention. */
  step?: number;
}

export interface Finding {
  kind: VerdictKind;
  confidence: Confidence;
  evidence: Evidence[];
  next: NextStepCode | null;
  /** Numbers used by messages (insufficient-data). */
  params?: Record<string, number>;
}

export interface Thresholds {
  windows: number;
  minSamples: number;
  minGrowthMB: number;
  minRelGrowth: number;
  minHandleGrowth: number;
  minR2: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  windows: 8,
  minSamples: 6,
  minGrowthMB: 5,
  minRelGrowth: 0.1,
  minHandleGrowth: 10,
  minR2: 0.5,
};

interface Scored {
  evidence: Evidence;
  trend: Trend;
  qualifies: boolean;
  threshold: number;
}

function evidenceOf(metric: string, unit: Evidence['unit'], tr: Trend, qualifies: boolean): Evidence {
  const e: Evidence = {
    metric,
    unit,
    role: qualifies ? 'grew' : 'flat',
    from: tr.first,
    to: tr.last,
    delta: tr.delta,
    slopePerHour: tr.slopePerSec * 3600,
    r2: tr.r2,
  };
  return e;
}

function scoreMemory(ts: number[], ys: number[], metric: string, th: Thresholds): Scored {
  const tr = trend(ts, ys, th.windows);
  const threshold = Math.max(th.minGrowthMB * MB, th.minRelGrowth * tr.first);
  const qualifies = tr.delta >= threshold && tr.slopePerSec > 0 && tr.r2 >= th.minR2;
  return { evidence: evidenceOf(metric, 'bytes', tr, qualifies), trend: tr, qualifies, threshold };
}

function scoreHandles(ts: number[], ys: number[], metric: string, th: Thresholds): Scored {
  const tr = trend(ts, ys, th.windows);
  const qualifies = tr.delta >= th.minHandleGrowth && tr.slopePerSec > 0 && tr.r2 >= th.minR2;
  return { evidence: evidenceOf(metric, 'count', tr, qualifies), trend: tr, qualifies, threshold: th.minHandleGrowth };
}

function confidenceOf(best: Scored): Confidence {
  if (best.trend.r2 >= 0.9 && best.trend.delta >= 2 * best.threshold) return 'high';
  if (best.trend.r2 >= 0.7) return 'medium';
  return 'low';
}

function strongest(list: Scored[]): Scored {
  return list.reduce((a, b) => (b.trend.delta > a.trend.delta ? b : a));
}

/** Decide which kinds of growth the (time sorted, single process) rows show. */
export function evaluate(rows: readonly Row[], th: Thresholds): Finding[] {
  const windows = Math.min(th.windows, Math.floor(rows.length / 2));
  if (rows.length < th.minSamples || windows < 3) {
    return [
      {
        kind: 'insufficient-data',
        confidence: 'high',
        evidence: [],
        next: 'collect-longer',
        params: { samples: rows.length, needed: th.minSamples },
      },
    ];
  }
  const eff: Thresholds = { ...th, windows };
  const ts = rows.map((r) => r.t);
  const series = (pick: (r: Row) => number): number[] => rows.map(pick);

  const heap = scoreMemory(ts, series((r) => r.heapUsed), 'heapUsed', eff);
  const external = scoreMemory(ts, series((r) => r.external), 'external', eff);
  const hasArrayBuffers = rows.some((r) => r.arrayBuffers > 0);
  const arrayBuffers = hasArrayBuffers
    ? scoreMemory(ts, series((r) => r.arrayBuffers), 'arrayBuffers', eff)
    : undefined;
  const rss = scoreMemory(ts, series((r) => r.rss), 'rss', eff);

  const findings: Finding[] = [];

  if (heap.qualifies) {
    findings.push({
      kind: 'js-heap',
      confidence: confidenceOf(heap),
      evidence: [heap.evidence],
      next: 'heap-snapshot',
    });
  }

  const nativeGrew = [external, arrayBuffers].filter((s): s is Scored => s !== undefined && s.qualifies);
  if (nativeGrew.length > 0) {
    const evidence = nativeGrew.map((s) => s.evidence);
    if (!heap.qualifies) evidence.push(heap.evidence);
    findings.push({
      kind: 'native-buffer',
      confidence: confidenceOf(strongest(nativeGrew)),
      evidence,
      next: 'buffer-retention',
    });
  }

  const kinds = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r.resources)) kinds.add(k);
  const handleGrew: Scored[] = [];
  for (const kind of [...kinds].sort()) {
    const s = scoreHandles(ts, series((r) => r.resources[kind] ?? 0), 'resources.' + kind, eff);
    if (s.qualifies) handleGrew.push(s);
  }
  if (handleGrew.length > 0) {
    handleGrew.sort((a, b) => b.trend.delta - a.trend.delta);
    findings.push({
      kind: 'handles',
      confidence: confidenceOf(handleGrew[0]!),
      evidence: handleGrew.map((s) => s.evidence),
      next: 'why-is-node-running',
    });
  }

  // rss grows while neither the JS heap nor external memory explains it, and nothing else
  // was found: memory held by the allocator or runtime. Never stated as a certain leak.
  if (findings.length === 0 && rss.qualifies) {
    const grew: Evidence = { ...rss.evidence, step: rss.trend.step };
    findings.push({
      kind: 'allocator-retention',
      confidence: 'suspected',
      evidence: [grew, heap.evidence, external.evidence],
      next: 'allocator-ab',
    });
  }

  if (findings.length === 0) {
    findings.push({
      kind: 'none',
      confidence: 'medium',
      evidence: [rss.evidence, heap.evidence, external.evidence],
      next: null,
    });
  }
  return findings;
}
