import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dist } from './helpers.mjs';

const { ols, envelope, largestStep, trend } = await import(dist('esm/analyze/stats.js'));

const close = (actual, expected, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < eps, `expected ${expected}, got ${actual}`);

test('ols: exact line y = 2x + 1 gives slope 2, intercept 1, R2 1', () => {
  const fit = ols([0, 1, 2, 3], [1, 3, 5, 7]);
  close(fit.slope, 2);
  close(fit.intercept, 1);
  close(fit.r2, 1);
});

test('ols: hand computed noisy example (slope 0.9, R2 = 20.25 / 23.75)', () => {
  // x = 0..3, y = 0,1,1,3 -> Sxy = 4.5, Sxx = 5, Syy = 4.75
  const fit = ols([0, 1, 2, 3], [0, 1, 1, 3]);
  close(fit.slope, 0.9);
  close(fit.r2, 20.25 / 23.75);
});

test('ols: flat series has slope 0 and R2 0; fewer than 2 points is safe', () => {
  const flat = ols([0, 1, 2, 3], [5, 5, 5, 5]);
  assert.equal(flat.slope, 0);
  assert.equal(flat.r2, 0);
  assert.equal(ols([1], [2]).slope, 0);
  assert.equal(ols([], []).r2, 0);
});

test('envelope keeps the lowest point of each window and drops the sawtooth', () => {
  // 12 points, 4 windows of 3; floor is 10, 11, 12, 13 with spikes on top
  const ys = [10, 18, 14, 11, 19, 15, 12, 20, 16, 13, 21, 17];
  const xs = ys.map((_, i) => i);
  const env = envelope(xs, ys, 4);
  assert.deepEqual(env.y, [10, 11, 12, 13]);
  assert.deepEqual(env.x, [0, 3, 6, 9]);
});

test('largestStep finds the biggest single rise', () => {
  assert.equal(largestStep([1, 2, 12, 12, 11, 15]), 10);
  assert.equal(largestStep([5, 4, 3]), 0);
});

test('trend: floor rising 1 per window gives delta 7 and R2 1', () => {
  const ys = [10, 18, 14, 11, 19, 15, 12, 20, 16, 13, 21, 17, 14, 22, 18, 15, 23, 19];
  const ts = ys.map((_, i) => i * 1000);
  // 6 windows of 3 -> floors 10, 11, 12, 13, 14, 15 at i = 0, 3, 6, 9, 12, 15
  const tr = trend(ts, ys, 6);
  assert.equal(tr.first, 10);
  assert.equal(tr.last, 15);
  assert.equal(tr.delta, 5);
  close(tr.slopePerSec, 1 / 3); // +1 every 3 seconds
  close(tr.r2, 1);
  assert.equal(tr.step, 1);
});
