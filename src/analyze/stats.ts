// Small numeric helpers. All pure functions, no dependencies.

export interface Fit {
  /** Slope in y units per x unit. */
  slope: number;
  intercept: number;
  /** Coefficient of determination, 0..1. 0 when y does not vary or there are fewer than 2 points. */
  r2: number;
}

/** Ordinary least squares line fit. */
export function ols(xs: readonly number[], ys: readonly number[]): Fit {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { slope: 0, intercept: n === 1 ? (ys[0] ?? 0) : 0, r2: 0 };
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!;
    sy += ys[i]!;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return { slope: 0, intercept: my, r2: 0 };
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept: my - slope * mx, r2 };
}

export interface Envelope {
  x: number[];
  y: number[];
}

/**
 * Lower envelope: split the samples into `windows` contiguous groups and keep the lowest
 * point of each. A garbage-collection sawtooth disappears; real accumulation lifts the floor.
 */
export function envelope(xs: readonly number[], ys: readonly number[], windows: number): Envelope {
  const n = Math.min(xs.length, ys.length);
  const out: Envelope = { x: [], y: [] };
  for (let w = 0; w < windows; w++) {
    const from = Math.floor((w * n) / windows);
    const to = Math.floor(((w + 1) * n) / windows);
    if (to <= from) continue;
    let best = from;
    for (let i = from + 1; i < to; i++) {
      if (ys[i]! < ys[best]!) best = i;
    }
    out.x.push(xs[best]!);
    out.y.push(ys[best]!);
  }
  return out;
}

/** Largest single increase between consecutive points (0 when the series never rises). */
export function largestStep(ys: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < ys.length; i++) {
    best = Math.max(best, ys[i]! - ys[i - 1]!);
  }
  return best;
}

export interface Trend {
  first: number;
  last: number;
  /** last - first of the envelope. */
  delta: number;
  /** Envelope slope in value units per second. */
  slopePerSec: number;
  r2: number;
  step: number;
}

/** Envelope trend of one series. `ts` are epoch milliseconds. */
export function trend(ts: readonly number[], ys: readonly number[], windows: number): Trend {
  const t0 = ts[0] ?? 0;
  const env = envelope(
    ts.map((t) => (t - t0) / 1000),
    ys,
    windows,
  );
  const fit = ols(env.x, env.y);
  const first = env.y[0] ?? 0;
  const last = env.y[env.y.length - 1] ?? 0;
  return {
    first,
    last,
    delta: last - first,
    slopePerSec: fit.slope,
    r2: fit.r2,
    step: largestStep(env.y),
  };
}
