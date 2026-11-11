// English message table. Every key here must also exist in ko.ts (checked by a test).
export const en = {
  // ---- errors (library throws codes + params; messages are rendered from here) ----
  'err.E_FILE_NOT_FOUND':
    'File not found: {path}. Check the path, and pass rotated files too (for example mem.jsonl mem.jsonl.1).',
  'err.E_FILE_ACCESS':
    'Cannot read {path} ({reason}). Check the file permissions or run as a user that can read it.',
  'err.E_IS_DIRECTORY':
    '{path} is a directory. Pass the JSONL files inside it instead (for example {path}/mem.jsonl).',
  'err.E_EMPTY_INPUT':
    'No samples found in {path}. Start the sampler first and let it write at least one row.',
  'err.E_PARSE':
    '{path}:{line}: invalid JSON ({reason}). Each line must be one JSON object; fix or remove that line.',
  'err.E_SCHEMA':
    "{where}: invalid row, field '{field}' must be {expected}. See the data format section of the README (schema v1).",
  'err.E_BAD_OPTION': 'Invalid value for {option}: "{value}". Expected {expected}.',
  'err.E_UNKNOWN_OPTION': 'Unknown option {option}. Run leakverdict --help to see the available options.',
  'err.E_MISSING_VALUE': 'Option {option} needs a value. Example: {option} <value> (see leakverdict --help).',
  'err.E_NO_FILES':
    'Give at least one JSONL file to analyze. Example: leakverdict analyze mem.jsonl (add rotated files too: mem.jsonl.1).',
  'err.E_UNKNOWN_SCENARIO': 'Unknown scenario "{name}". Choose one of: {choices}.',
  'err.E_WRITE':
    'Cannot write {path} ({reason}). Choose a writable location (for example with --out) or fix the directory permissions.',
  'err.E_SIMULATE_FAILED':
    'The simulation child process for "{scenario}" failed ({reason}). Run it again; if it keeps failing, run the scenario with node --expose-gc to see the error.',
  // expected-value descriptions used by E_BAD_OPTION and E_SCHEMA
  'exp.positive-int': 'a positive integer',
  'exp.int-min-3': 'an integer of at least 3',
  'exp.number-min-0': 'a number of at least 0',
  'exp.number-min-1': 'a number of at least 1',
  'exp.number-0-1': 'a number between 0 and 1',
  'exp.pid': 'a process id (positive integer)',
  'exp.pid-in-input': 'one of the pids in the input ({list})',
  'exp.command': 'analyze or simulate',
  'exp.format': 'one of {list}',
  'exp.fail-on': 'any, or a comma separated list of {list}',
  'exp.lang': 'en or ko',
  'exp.int-3-1000': 'an integer between 3 and 1000',
  'exp.int-1-60000': 'an integer between 1 and 60000',
  'exp.non-empty-path': 'a non-empty path',
  'exp.name-and-number': 'a non-empty name and a finite number',
  'exp.json-object': 'a JSON object',
  'exp.one': 'the number 1',
  'exp.epoch-ms': 'a number (epoch ms)',
  'exp.non-negative-int': 'a non-negative integer',
  'exp.non-empty-string': 'a non-empty string',
  'exp.bytes': 'a non-negative number (bytes)',
  'exp.object-of-numbers': 'an object of numbers',
  'exp.non-negative-number': 'a non-negative number',
  'err.unexpected': 'Unexpected error: {message}',
  'cli.errorPrefix': 'leakverdict: error:',

  // ---- warnings ----
  'warn.W_MULTIPLE_PIDS':
    'The input contains several processes (pids {pids}); analyzing the last one ({used}). Use --pid to choose another.',
  'warn.W_MIXED_NODE':
    'The input mixes Node versions ({versions}); growth patterns may differ between versions.',

  // ---- verdict titles, confidence, next steps ----
  'kind.js-heap': 'JS objects keep accumulating on the V8 heap',
  'kind.native-buffer': 'Native memory (Buffers/ArrayBuffers) keeps growing outside the V8 heap',
  'kind.handles': 'Active handles (timers, sockets, requests) are never released',
  'kind.allocator-retention': 'Memory is not returned to the OS (allocator retention suspected)',
  'kind.none': 'No sustained growth detected',
  'kind.insufficient-data': 'Not enough data for a verdict',
  'conf.high': 'high',
  'conf.medium': 'medium',
  'conf.low': 'low',
  'conf.suspected': 'suspected',
  'next.heap-snapshot':
    'Take heap snapshots a few minutes apart and compare them (for example with memlab or Chrome DevTools) to find what retains the objects.',
  'next.buffer-retention':
    'Look for places that keep Buffers alive (caches, queues, unconsumed streams) and check stream backpressure.',
  'next.why-is-node-running':
    'List what keeps the event loop busy (for example with why-is-node-running) and close the timers, sockets and requests that are never released.',
  'next.allocator-ab':
    'This may not be an application leak. Run the same workload with another allocator (for example jemalloc) or another Node version before changing code.',
  'next.collect-longer':
    'Keep the sampler running longer (at least {needed} samples, ideally hours) and analyze again.',

  // ---- evidence lines ----
  'ev.grew.bytes':
    '{metric}: {from} MB -> {to} MB ({delta} MB), slope {slope} MB/h, R2 {r2}',
  'ev.grew.count': '{metric}: {from} -> {to} ({delta}), slope {slope}/h, R2 {r2}',
  'ev.flat.bytes': '{metric}: {from} MB -> {to} MB ({delta} MB), no sustained growth',
  'ev.flat.count': '{metric}: {from} -> {to} ({delta}), no sustained growth',
  'ev.stepSuffix': 'largest single jump +{size} MB',

  // ---- report ----
  'report.title': 'leakverdict report',
  'report.span': 'Samples: {samples} over {minutes} min ({from} .. {to}), pid {pid}, Node {node}',
  'report.next': 'Next step',
  'report.warnings': 'Warnings',
  'report.insufficient': 'Only {samples} samples were usable (at least {needed} are needed).',
  'md.col.verdict': 'Verdict',
  'md.col.confidence': 'Confidence',
  'md.col.evidence': 'Evidence',
  'md.col.next': 'Next step',

  // ---- CLI ----
  'cli.help': `leakverdict {version} - tells you which kind of Node.js memory growth you have

Usage:
  leakverdict analyze <files...> [options]    analyze JSONL metric logs (rotated files too)
  leakverdict simulate <scenario> [options]   run a real child Node process that grows memory, then analyze it

Scenarios: {scenarios}

Options:
  --format <text|md|json>   report format (default: text)
  --fail-on <kinds|any>     exit with code 1 when one of these verdicts is found
                            (comma separated: js-heap, native-buffer, handles, allocator-retention; or "any")
  --lang <en|ko>            message language (default: LEAKVERDICT_LANG, then LC_ALL, LC_MESSAGES, LANG)
  --pid <n>                 analyze this process id when the input contains several
  --min-samples <n>         minimum rows for a verdict (default 6)
  --min-growth-mb <n>       minimum absolute growth in MB (default 5)
  --min-rel-growth <n>      minimum growth relative to the starting level, 0.1 = 10% (default 0.1;
                            lower it for big heaps; giving only --min-growth-mb sets this to 0)
  --min-r2 <0..1>           minimum trend fit (default 0.5)
  --out <file>              simulate: keep the recorded JSONL here
  --steps <n>               simulate: number of growth steps (default 10)
  --interval-ms <n>         simulate: pause between steps in ms (default 50)
  -h, --help                show this help
  -v, --version             show the version

Exit codes: 0 ok, 1 a --fail-on verdict was found, 2 input or option error.`,
} as const;

export type MessageKey = keyof typeof en;
