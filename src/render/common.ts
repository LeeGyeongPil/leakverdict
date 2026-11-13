import type { Evidence, Finding } from '../analyze/index.js';
import type { Report } from '../analyze/index.js';
import type { Warning } from '../errors.js';
import { t } from '../i18n/index.js';
import type { Lang, MessageKey } from '../i18n/index.js';

const MB = 1024 * 1024;

function mb(bytes: number): string {
  return (bytes / MB).toFixed(1);
}

function signed(n: number, text: string): string {
  if (/^-0(\.0+)?$/.test(text)) return text.slice(1); // never print "-0.0"
  return n > 0 ? '+' + text : text;
}

export function evidenceLine(e: Evidence, lang: Lang): string {
  const bytes = e.unit === 'bytes';
  const from = bytes ? mb(e.from) : String(e.from);
  const to = bytes ? mb(e.to) : String(e.to);
  const delta = signed(e.delta, bytes ? mb(e.delta) : String(e.delta));
  const key = ('ev.' + e.role + '.' + e.unit) as MessageKey;
  let line = t(lang, key, {
    metric: e.metric,
    from,
    to,
    delta,
    slope: signed(e.slopePerHour, bytes ? mb(e.slopePerHour) : e.slopePerHour.toFixed(1)),
    r2: e.r2.toFixed(2),
  });
  if (e.step !== undefined && e.step > 0) {
    line += '; ' + t(lang, 'ev.stepSuffix', { size: mb(e.step) });
  }
  return line;
}

export function findingTitle(f: Finding, lang: Lang): string {
  return t(lang, ('kind.' + f.kind) as MessageKey);
}

export function findingDetail(f: Finding, report: Report, lang: Lang): string | undefined {
  if (f.kind === 'insufficient-data') {
    const base = t(lang, 'report.insufficient', {
      samples: report.span.samples,
      needed: f.params?.needed ?? 0,
    });
    return report.skipped > 0 ? base + t(lang, 'report.skipped', { skipped: report.skipped }) : base;
  }
  return undefined;
}

export function nextText(f: Finding, lang: Lang): string | undefined {
  if (f.next === null) return undefined;
  const params: Record<string, number> = f.params ?? {};
  return t(lang, ('next.' + f.next) as MessageKey, params);
}

export function confidenceText(f: Finding, lang: Lang): string {
  return t(lang, ('conf.' + f.confidence) as MessageKey);
}

export function warningText(w: Warning, lang: Lang): string {
  return t(lang, ('warn.' + w.code) as MessageKey, w.params);
}

function isoSeconds(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function spanLine(report: Report, lang: Lang): string {
  const minutes = ((report.span.to - report.span.from) / 60000).toFixed(1);
  return t(lang, 'report.span', {
    samples: report.span.samples,
    minutes,
    from: isoSeconds(report.span.from),
    to: isoSeconds(report.span.to),
    pid: report.span.pid,
    node: report.span.node,
  });
}
