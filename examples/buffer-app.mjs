// A tiny app that keeps 2 MB Buffers alive, so leakverdict has something to find.
// Run: LEAKVERDICT_FILE=./mem.jsonl LEAKVERDICT_INTERVAL_MS=100 node --import leakverdict/register examples/buffer-app.mjs
const keep = [];
for (let i = 0; i < 8; i++) {
  keep.push(Buffer.alloc(2 * 1024 * 1024, 1));
  await new Promise((resolve) => setTimeout(resolve, 150));
}
console.log(`kept ${keep.length} buffers`);
