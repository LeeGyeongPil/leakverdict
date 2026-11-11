// Public API. Everything not exported here is internal and may change.
export { startSampler, sampleOnce } from './sampler.js';
export type { Sampler, SamplerOptions } from './sampler.js';
export { readJsonl } from './read.js';
export type { ReadOptions, ReadResult } from './read.js';
export { analyze } from './analyze/index.js';
export type {
  AnalyzeOptions,
  Confidence,
  Evidence,
  Finding,
  NextStepCode,
  Report,
  VerdictKind,
} from './analyze/index.js';
export { renderReport } from './render/index.js';
export type { ReportFormat } from './render/index.js';
export { resolveLang } from './i18n/index.js';
export type { Lang } from './i18n/index.js';
export { validateRow } from './row.js';
export type { Row } from './row.js';
export { LeakverdictError } from './errors.js';
export type { ErrorCode, Warning, WarningCode } from './errors.js';
