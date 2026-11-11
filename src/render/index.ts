import type { Report } from '../analyze/index.js';
import { LeakverdictError } from '../errors.js';
import type { Lang } from '../i18n/index.js';
import { renderJson } from './json.js';
import { renderMarkdown } from './md.js';
import { renderText } from './text.js';

export type ReportFormat = 'text' | 'md' | 'json';

export const REPORT_FORMATS: readonly ReportFormat[] = ['text', 'md', 'json'];

/** Render a report as text, markdown (for CI summaries) or JSON, in English or Korean. */
export function renderReport(
  report: Report,
  opts: { format: ReportFormat; lang?: Lang },
): string {
  const lang = opts.lang ?? 'en';
  switch (opts.format) {
    case 'text':
      return renderText(report, lang);
    case 'md':
      return renderMarkdown(report, lang);
    case 'json':
      return renderJson(report, lang);
    default:
      throw new LeakverdictError('E_BAD_OPTION', {
        option: 'format',
        value: String(opts.format),
        expected: REPORT_FORMATS.join(', '),
      });
  }
}
