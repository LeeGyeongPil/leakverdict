// Minimal HTTP server with leakverdict attached.
// Run: node examples/http-server.mjs [--exit-after <ms>]
// Then:  npx leakverdict analyze mem.jsonl
import { createServer } from 'node:http';
import { startSampler } from '../dist/esm/index.js';

const exitAfter = Number(process.argv[process.argv.indexOf('--exit-after') + 1] || 0);

const sampler = startSampler({ file: './mem.jsonl', intervalMs: 5000 });
const cache = []; // the deliberate "leak": every request keeps a 64 KiB Buffer

const server = createServer((req, res) => {
  sampler.count('requests');
  cache.push(Buffer.alloc(64 * 1024));
  res.end('ok\n');
});
server.listen(3000, '127.0.0.1', () => console.log('listening on http://127.0.0.1:3000'));

async function shutdown() {
  await sampler.stop();
  server.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
if (exitAfter > 0) setTimeout(shutdown, exitAfter);
