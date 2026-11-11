import { renderError } from './i18n/index.js';

export type ErrorCode =
  | 'E_FILE_NOT_FOUND'
  | 'E_FILE_ACCESS'
  | 'E_IS_DIRECTORY'
  | 'E_EMPTY_INPUT'
  | 'E_PARSE'
  | 'E_SCHEMA'
  | 'E_BAD_OPTION'
  | 'E_UNKNOWN_OPTION'
  | 'E_MISSING_VALUE'
  | 'E_NO_FILES'
  | 'E_UNKNOWN_SCENARIO'
  | 'E_WRITE'
  | 'E_SIMULATE_FAILED';

export const ERROR_CODES: readonly ErrorCode[] = [
  'E_FILE_NOT_FOUND',
  'E_FILE_ACCESS',
  'E_IS_DIRECTORY',
  'E_EMPTY_INPUT',
  'E_PARSE',
  'E_SCHEMA',
  'E_BAD_OPTION',
  'E_UNKNOWN_OPTION',
  'E_MISSING_VALUE',
  'E_NO_FILES',
  'E_UNKNOWN_SCENARIO',
  'E_WRITE',
  'E_SIMULATE_FAILED',
];

export type Params = Record<string, string | number>;

/** Every error this package throws on purpose. `code` and `params` are language neutral. */
export class LeakverdictError extends Error {
  readonly code: ErrorCode;
  readonly params: Params;

  constructor(code: ErrorCode, params: Params = {}) {
    super(renderError('en', code, params));
    this.name = 'LeakverdictError';
    this.code = code;
    this.params = params;
  }
}

export type WarningCode = 'W_MULTIPLE_PIDS' | 'W_MIXED_NODE';

export interface Warning {
  code: WarningCode;
  params: Params;
}
