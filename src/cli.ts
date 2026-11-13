import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { analyze } from './analyze/index.js';
import type { AnalyzeOptions, VerdictKind } from './analyze/index.js';
import { LeakverdictError } from './errors.js';
import { renderError, resolveLang, t } from './i18n/index.js';
import type { Lang, MessageKey } from './i18n/index.js';
import { readJsonl } from './read.js';
import { REPORT_FORMATS, renderReport } from './render/index.js';
import type { ReportFormat } from './render/index.js';
import { SCENARIOS } from './scenarios/names.js';

export interface CliIo {
  env: NodeJS.ProcessEnv;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Replaces the file reader (tests inject read errors here). */
  readFile?: (path: string) => Promise<string>;
}

const OPTIONS = {
  format: { type: 'string' },
  'fail-on': { type: 'string' },
  lang: { type: 'string' },
  pid: { type: 'string' },
  'min-samples': { type: 'string' },
  'min-growth-mb': { type: 'string' },
  'min-rel-growth': { type: 'string' },
  'min-r2': { type: 'string' },
  out: { type: 'string' },
  steps: { type: 'string' },
  'interval-ms': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

const KINDS: readonly VerdictKind[] = [
  'js-heap',
  'native-buffer',
  'handles',
  'allocator-retention',
  'none',
  'insufficient-data',
];

/** `expected` is a language neutral code (see the exp.* messages), `list` fills its {list} placeholder. */
function badOption(option: string, value: string, expected: string, list = ''): LeakverdictError {
  return new LeakverdictError('E_BAD_OPTION', { option, value, expected, list });
}

/** Find --lang in raw arguments, so even a broken command line is answered in the right language. */
function scanLang(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '--lang') return argv[i + 1];
    if (a.startsWith('--lang=')) return a.slice('--lang='.length);
  }
  return undefined;
}

function toNumber(option: string, raw: string | undefined, expected: string, ok: (n: number) => boolean): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(n) || !ok(n)) throw badOption(option, raw, expected);
  return n;
}

function parseFailOn(raw: string | undefined): Set<VerdictKind> | 'any' | undefined {
  if (raw === undefined) return undefined;
  const parts = raw.split(',').map((p) => p.trim()).filter((p) => p !== '');
  const list = KINDS.join(', ');
  if (parts.length === 0) throw badOption('--fail-on', raw, 'fail-on', list);
  if (parts.includes('any')) return 'any';
  const set = new Set<VerdictKind>();
  for (const p of parts) {
    if (!KINDS.includes(p as VerdictKind)) throw badOption('--fail-on', p, 'fail-on', list);
    set.add(p as VerdictKind);
  }
  return set;
}

function packageVersion(): string {
  const url = new URL('../../package.json', import.meta.url);
  return (JSON.parse(readFileSync(url, 'utf8')) as { version: string }).version;
}

/** Run a simulation scenario in a real child process (with --expose-gc) and return when it ends. */
function runChild(scenario: string, steps: number, intervalMs: number, outFile: string): Promise<void> {
  const runner = fileURLToPath(new URL('./scenarios/run.js', import.meta.url));
  const limitMs = steps * intervalMs + 120_000;
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--expose-gc', runner, scenario, String(steps), String(intervalMs), outFile],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderrTail = '';
    // Safety net: a scenario that never ends is killed after its expected run time plus 2 minutes.
    const killer = setTimeout(() => {
      stderrTail = 'timed out after ' + Math.round(limitMs / 1000) + ' s';
      child.kill('SIGKILL');
    }, limitMs);
    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-400);
    });
    // Register signal handlers before doing anything else so Ctrl-C also stops the child.
    const forward = (signal: NodeJS.Signals) => () => {
      child.kill(signal);
    };
    const onInt = forward('SIGINT');
    const onTerm = forward('SIGTERM');
    process.on('SIGINT', onInt);
    process.on('SIGTERM', onTerm);
    const cleanup = () => {
      clearTimeout(killer);
      process.off('SIGINT', onInt);
      process.off('SIGTERM', onTerm);
    };
    child.on('error', (e) => {
      cleanup();
      reject(new LeakverdictError('E_SIMULATE_FAILED', { scenario, reason: e.message }));
    });
    child.on('close', (code, signal) => {
      cleanup();
      if (code === 0) {
        resolve();
        return;
      }
      const lastLine = stderrTail.trim().split('\n').pop() ?? '';
      const reason = signal ? 'signal ' + signal : 'exit ' + code + (lastLine ? ': ' + lastLine : '');
      reject(new LeakverdictError('E_SIMULATE_FAILED', { scenario, reason }));
    });
  });
}

/**
 * Command line entry. Returns the exit code instead of exiting:
 * 0 ok, 1 a --fail-on verdict was found, 2 input or option error.
 */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const early = scanLang(argv);
  let lang: Lang = resolveLang(early === 'ko' || early === 'en' ? early : undefined, io.env);
  let tmpDir: string | undefined;
  try {
    let parsed;
    try {
      parsed = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
    } catch (e) {
      const err = e as NodeJS.ErrnoException & { message: string };
      const m = /'(-{1,2}[\w-]+)/.exec(err.message);
      const option = m?.[1] ?? 'arguments';
      // parseArgs says ERR_PARSE_ARGS_UNKNOWN_OPTION for a name it does not know, and
      // ERR_PARSE_ARGS_INVALID_OPTION_VALUE when a string option has no value.
      const missing = err.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE';
      throw new LeakverdictError(missing ? 'E_MISSING_VALUE' : 'E_UNKNOWN_OPTION', { option });
    }
    const { values, positionals } = parsed;

    if (values.lang !== undefined && values.lang !== 'en' && values.lang !== 'ko') {
      throw badOption('--lang', values.lang, 'lang');
    }
    lang = resolveLang(values.lang, io.env);

    if (values.help || (positionals.length === 0 && !values.version)) {
      io.stdout(t(lang, 'cli.help', { version: packageVersion(), scenarios: SCENARIOS.join(', '), kinds: KINDS.join(', ') }) + '\n');
      return 0;
    }
    if (values.version) {
      io.stdout(packageVersion() + '\n');
      return 0;
    }

    const format = (values.format ?? 'text') as ReportFormat;
    if (!REPORT_FORMATS.includes(format)) throw badOption('--format', String(values.format), 'format', REPORT_FORMATS.join(', '));
    const failOn = parseFailOn(values['fail-on']);
    const pid = toNumber('--pid', values.pid, 'pid', (n) => Number.isInteger(n) && n > 0);
    const analyzeOpts: AnalyzeOptions = {};
    const minSamples = toNumber('--min-samples', values['min-samples'], 'int-min-3', (n) => Number.isInteger(n) && n >= 3);
    const minGrowth = toNumber('--min-growth-mb', values['min-growth-mb'], 'number-min-0', (n) => n >= 0);
    const minRel = toNumber('--min-rel-growth', values['min-rel-growth'], 'number-min-0', (n) => n >= 0);
    const minR2 = toNumber('--min-r2', values['min-r2'], 'number-0-1', (n) => n >= 0 && n <= 1);
    if (minSamples !== undefined) analyzeOpts.minSamples = minSamples;
    if (minGrowth !== undefined) analyzeOpts.minGrowthMB = minGrowth;
    // An absolute threshold given on its own replaces the relative one; otherwise the default 10% of a
    // big heap would hide the growth no matter how low --min-growth-mb is.
    if (minRel !== undefined) analyzeOpts.minRelGrowth = minRel;
    else if (minGrowth !== undefined) analyzeOpts.minRelGrowth = 0;
    if (minR2 !== undefined) analyzeOpts.minR2 = minR2;

    const [command, ...rest] = positionals;
    let files: string[];
    if (command === 'analyze') {
      files = rest;
    } else if (command === 'simulate') {
      const name = rest[0] ?? '';
      if (!(SCENARIOS as readonly string[]).includes(name)) {
        throw new LeakverdictError('E_UNKNOWN_SCENARIO', { name, choices: SCENARIOS.join(', ') });
      }
      const steps = toNumber('--steps', values.steps, 'int-3-1000', (n) => Number.isInteger(n) && n >= 3 && n <= 1000) ?? 10;
      const intervalMs = toNumber('--interval-ms', values['interval-ms'], 'int-1-60000', (n) => Number.isInteger(n) && n >= 1 && n <= 60000) ?? 50;
      let out = values.out;
      if (out === undefined) {
        tmpDir = mkdtempSync(join(tmpdir(), 'leakverdict-'));
        out = join(tmpDir, 'simulate.jsonl');
      }
      try {
        writeFileSync(out, '');
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        throw new LeakverdictError('E_WRITE', { path: out, reason: typeof code === 'string' ? code : (e as Error).message });
      }
      await runChild(name, steps, intervalMs, out);
      files = [out];
    } else {
      throw badOption('command', command ?? '', 'command');
    }

    const read = await readJsonl(files, { pid, readFile: io.readFile });
    const report = analyze(read.rows, analyzeOpts);
    report.warnings.push(...read.warnings);
    io.stdout(renderReport(report, { format, lang }));

    if (failOn === undefined) return 0;
    const hit = report.findings.some((f) =>
      failOn === 'any' ? f.kind !== 'none' && f.kind !== 'insufficient-data' : failOn.has(f.kind),
    );
    return hit ? 1 : 0;
  } catch (e) {
    const prefix = t(lang, 'cli.errorPrefix');
    if (e instanceof LeakverdictError) {
      io.stderr(prefix + ' ' + renderError(lang, e.code, e.params) + '\n');
    } else {
      io.stderr(prefix + ' ' + t(lang, 'err.unexpected', { message: (e as Error).message }) + '\n');
    }
    return 2;
  } finally {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }
}
