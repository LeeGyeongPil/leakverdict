// Child process of `leakverdict simulate`. It really allocates memory (run it with --expose-gc)
// and records the same JSONL rows as the sampler would in production.
// usage: node --expose-gc run.js <scenario> <steps> <intervalMs> <outFile>
import net from 'node:net';
import { startSampler } from '../sampler.js';
import { SCENARIOS } from './names.js';
import type { Scenario } from './names.js';

const MB = 1024 * 1024;

const scenario = process.argv[2] as Scenario;
const steps = Number(process.argv[3]);
const intervalMs = Number(process.argv[4]);
const outFile = process.argv[5] ?? '';

if (!SCENARIOS.includes(scenario) || !Number.isInteger(steps) || steps < 1 || outFile === '') {
  process.stderr.write('usage: run.js <scenario> <steps> <intervalMs> <outFile>\n');
  process.exit(2);
}

// Kept alive on purpose: this is the "leak".
const keep: unknown[] = [];
const timers: NodeJS.Timeout[] = [];
const sockets: net.Socket[] = [];
let server: net.Server | undefined;

function collectGarbage(): void {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc) gc();
}

async function grow(step: number): Promise<void> {
  if (scenario === 'buffer') {
    // 5 MB Buffer per step: lives outside the V8 heap.
    keep.push(Buffer.alloc(5 * MB, 1));
  } else if (scenario === 'jsobj') {
    // 50k small JS objects per step: lives on the V8 heap.
    for (let i = 0; i < 50_000; i++) keep.push({ i, s: 'x' + i + ':' + step, a: [i, i + 1] });
  } else if (scenario === 'handle') {
    // 20 timers and 5 TCP sockets per step that are never closed.
    for (let i = 0; i < 20; i++) timers.push(setInterval(() => {}, 1_000_000));
    for (let i = 0; i < 5; i++) {
      await new Promise<void>((resolve) => {
        const socket = net.connect((server!.address() as net.AddressInfo).port, '127.0.0.1', resolve);
        sockets.push(socket);
      });
    }
  } else if (scenario === 'churn') {
    // Many mid-size native buffers, keep every 50th: native memory grows in jumps.
    const temp: Buffer[] = [];
    for (let i = 0; i < 2000; i++) temp.push(Buffer.allocUnsafeSlow(16 * 1024 + (i % 7) * 1024));
    temp.forEach((b, i) => {
      if (i % 50 === 0) keep.push(b);
    });
  } else if (scenario === 'release') {
    // First half: allocate a lot. Then drop everything and collect: rss may stay high.
    if (step <= Math.ceil(steps / 2)) {
      const chunk: unknown[] = [];
      for (let i = 0; i < 100_000; i++) chunk.push({ i, s: 'y' + i, a: [i] });
      for (let i = 0; i < 300; i++) chunk.push(Buffer.alloc(16 * 1024, 2));
      keep.push(chunk);
    } else if (step === Math.ceil(steps / 2) + 1) {
      keep.length = 0;
    }
  }
  collectGarbage();
}

if (scenario === 'handle') {
  server = net.createServer((s) => sockets.push(s));
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
}

const sampler = startSampler({ file: outFile, intervalMs: 3_600_000, maxBytes: 100_000_000, maxFiles: 1 });
for (let step = 1; step <= steps; step++) {
  await grow(step);
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
  sampler.sampleNow();
}
await sampler.stop();

for (const timer of timers) clearInterval(timer);
for (const socket of sockets) socket.destroy();
server?.close();
