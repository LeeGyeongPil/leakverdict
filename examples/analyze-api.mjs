// Analyze a recorded JSONL file with the library API.
// Run: node examples/analyze-api.mjs [file]
import { readJsonl, analyze, renderReport } from 'leakverdict';

const file = process.argv[2] ?? 'examples/samples/handles.jsonl';
const { rows, warnings } = await readJsonl(file);
const report = analyze(rows);

console.log(renderReport(report, { format: 'text', lang: 'en' }));
console.log('kinds:', report.findings.map((f) => `${f.kind} (${f.confidence})`).join(', '));
if (warnings.length > 0) console.log('warnings:', warnings.map((w) => w.code).join(', '));
