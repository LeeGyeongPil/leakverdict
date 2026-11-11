import type { Report } from '../analyze/index.js';
import { t } from '../i18n/index.js';
import type { Lang } from '../i18n/index.js';
import {
  confidenceText,
  evidenceLine,
  findingDetail,
  findingTitle,
  nextText,
  spanLine,
  warningText,
} from './common.js';

export function renderText(report: Report, lang: Lang): string {
  const out: string[] = [t(lang, 'report.title'), spanLine(report, lang), ''];
  report.findings.forEach((f, i) => {
    out.push(`[${i + 1}] ${f.kind} (${confidenceText(f, lang)}): ${findingTitle(f, lang)}`);
    const detail = findingDetail(f, report, lang);
    if (detail) out.push('    ' + detail);
    for (const e of f.evidence) out.push('    - ' + evidenceLine(e, lang));
    const next = nextText(f, lang);
    if (next) out.push(`    ${t(lang, 'report.next')}: ${next}`);
    out.push('');
  });
  if (report.warnings.length > 0) {
    out.push(t(lang, 'report.warnings') + ':');
    for (const w of report.warnings) out.push('  - ' + warningText(w, lang));
    out.push('');
  }
  return out.join('\n');
}
