// Preload entry: node --import leakverdict/register app.js   (or --require for CommonJS)
// Configured by environment variables; never throws into the host application.
import { isMainThread } from 'node:worker_threads';
import { startSampler } from './sampler.js';

function numberFromEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${name}="${raw}" is not a positive integer; sampler not started`);
  }
  return n;
}

/** One file per process, so cluster workers and forked children never share a file or its rotation. */
function outputFile(): string {
  const configured = process.env.LEAKVERDICT_FILE;
  if (configured === undefined || configured === '') return `./leakverdict-${process.pid}.jsonl`;
  return configured.split('{pid}').join(String(process.pid));
}

if (isMainThread) {
  try {
    const sampler = startSampler({
      file: outputFile(),
      intervalMs: numberFromEnv('LEAKVERDICT_INTERVAL_MS'),
      maxBytes: numberFromEnv('LEAKVERDICT_MAX_BYTES'),
      maxFiles: numberFromEnv('LEAKVERDICT_MAX_FILES'),
      onError: (e) => process.stderr.write('[leakverdict] ' + e.message + '\n'),
    });
    // One last row when the process ends, so short runs still show their final state.
    process.once('exit', () => {
      sampler.sampleNow();
    });
  } catch (e) {
    const message = (e as Error).message;
    const suffix = message.includes('sampler not started') ? '' : '; sampler not started';
    process.stderr.write('[leakverdict] ' + message + suffix + '\n');
  }
}
