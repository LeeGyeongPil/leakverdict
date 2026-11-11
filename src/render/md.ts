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

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function renderMarkdown(report: Report, lang: Lang): string {
  const out: string[] = ['## ' + t(lang, 'report.title'), '', spanLine(report, lang), ''];
  out.push(
    `| ${t(lang, 'md.col.verdict')} | ${t(lang, 'md.col.confidence')} | ${t(lang, 'md.col.evidence')} | ${t(lang, 'md.col.next')} |`,
  );
  out.push('|---|---|---|---|');
  for (const f of report.findings) {
    const evidence = f.evidence.map((e) => evidenceLine(e, lang));
    const detail = findingDetail(f, report, lang);
    if (detail) evidence.unshift(detail);
    out.push(
      `| **${f.kind}**: ${cell(findingTitle(f, lang))} | ${cell(confidenceText(f, lang))} | ${cell(evidence.join('<br>'))} | ${cell(nextText(f, lang) ?? '-')} |`,
    );
  }
  if (report.warnings.length > 0) {
    out.push('', '**' + t(lang, 'report.warnings') + '**', '');
    for (const w of report.warnings) out.push('- ' + warningText(w, lang));
  }
  out.push('');
  return out.join('\n');
}
