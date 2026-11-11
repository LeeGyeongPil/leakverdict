import { LeakverdictError } from './errors.js';

/** One sample. Memory values are bytes, as returned by process.memoryUsage(). */
export interface Row {
  v: 1;
  t: number;
  pid: number;
  threadId: number;
  node: string;
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
  resources: Record<string, number>;
  counters?: Record<string, number>;
}

export const MEMORY_FIELDS = ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'] as const;

function fail(field: string, expected: string): never {
  throw new LeakverdictError('E_SCHEMA', { where: 'row', field, expected });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkCountMap(value: unknown, field: string): Record<string, number> {
  if (!isRecord(value)) return fail(field, 'object-of-numbers');
  for (const [name, n] of Object.entries(value)) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
      return fail(`${field}.${name}`, 'non-negative-number');
    }
  }
  return value as Record<string, number>;
}

/** Validate a parsed JSON value against row schema v1. Throws E_SCHEMA with the field name. */
export function validateRow(value: unknown): Row {
  if (!isRecord(value)) return fail('row', 'json-object');
  if (value.v !== 1) fail('v', 'one');
  if (typeof value.t !== 'number' || !Number.isFinite(value.t)) fail('t', 'epoch-ms');
  for (const field of ['pid', 'threadId'] as const) {
    const n = value[field];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) fail(field, 'non-negative-int');
  }
  if (typeof value.node !== 'string' || value.node === '') fail('node', 'non-empty-string');
  for (const field of MEMORY_FIELDS) {
    const n = value[field];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) fail(field, 'bytes');
  }
  checkCountMap(value.resources, 'resources');
  if (value.counters !== undefined) checkCountMap(value.counters, 'counters');
  return value as unknown as Row;
}
