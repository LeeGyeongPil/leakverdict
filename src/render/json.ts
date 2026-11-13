import type { Report } from '../analyze/index.js';
import type { Lang } from '../i18n/index.js';
import {
  confidenceText,
  evidenceLine,
  findingDetail,
  findingTitle,
  nextText,
  warningText,
} from './common.js';

/** Machine readable report: language neutral codes plus rendered text in the chosen language. */
export function renderJson(report: Report, lang: Lang): string {
  const doc = {
    version: report.version,
    lang,
    span: report.span,
    skipped: report.skipped,
    findings: report.findings.map((f) => ({
      kind: f.kind,
      confidence: f.confidence,
      next: f.next,
      evidence: f.evidence,
      text: {
        title: findingTitle(f, lang),
        confidence: confidenceText(f, lang),
        detail: findingDetail(f, report, lang) ?? null,
        evidence: f.evidence.map((e) => evidenceLine(e, lang)),
        next: nextText(f, lang) ?? null,
      },
    })),
    warnings: report.warnings.map((w) => ({
      code: w.code,
      params: w.params,
      text: warningText(w, lang),
    })),
  };
  return JSON.stringify(doc, null, 2) + '\n';
}
