// Record memory samples inside your own process, then look at them.
// Run: node examples/sampler-basic.mjs
import { startSampler } from 'leakverdict';

const sampler = startSampler({ intervalMs: 100, maxRows: 50 }); // no file: rows stay in memory
const keep = [];
for (let i = 0; i < 5; i++) {
  sampler.count('requests', 10);
  keep.push(Buffer.alloc(1024 * 1024));
  await new Promise((resolve) => setTimeout(resolve, 120));
}
const rows = sampler.rows();
const last = rows[rows.length - 1];
console.log('rows:', rows.length);
console.log('last row keys:', Object.keys(last).join(','));
console.log('counters:', JSON.stringify(last.counters));
await sampler.stop();
