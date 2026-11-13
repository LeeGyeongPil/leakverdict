// Record memory samples inside your own process, then look at them.
// Run: node examples/sampler-basic.mjs
// Rows here come from sampleNow(); in a real service the interval timer does this.
import { startSampler } from 'leakverdict';

// A long interval keeps the timer from firing during this short run, so the row count is fixed.
const sampler = startSampler({ intervalMs: 60_000, maxRows: 50 }); // no file: rows stay in memory
const keep = [];
for (let i = 0; i < 5; i++) {
  sampler.count('requests', 10);
  keep.push(Buffer.alloc(1024 * 1024));
  await new Promise((resolve) => setTimeout(resolve, 120));
  sampler.sampleNow();
}
const rows = sampler.rows();
const last = rows[rows.length - 1];
console.log('rows:', rows.length);
console.log('last row keys:', Object.keys(last).join(','));
console.log('counters:', JSON.stringify(last.counters));
await sampler.stop();
