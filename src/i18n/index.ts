import { en } from './en.js';
import type { MessageKey } from './en.js';
import { ko } from './ko.js';

export type Lang = 'en' | 'ko';
export type { MessageKey };

export const messages: Record<Lang, Record<MessageKey, string>> = { en, ko };

/** Fill `{name}` placeholders. Unknown names are left as they are so mistakes stay visible. */
export function t(
  lang: Lang,
  key: MessageKey,
  params: Record<string, string | number> = {},
): string {
  const template = messages[lang][key];
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/**
 * Decide the output language.
 * Order: explicit argument > LEAKVERDICT_LANG > LC_ALL > LC_MESSAGES > LANG.
 * The first non-empty value decides; a value starting with "ko" means Korean, anything else English.
 */
export function resolveLang(argLang?: string, env: NodeJS.ProcessEnv = process.env): Lang {
  const candidates = [argLang, env.LEAKVERDICT_LANG, env.LC_ALL, env.LC_MESSAGES, env.LANG];
  for (const value of candidates) {
    if (value !== undefined && value !== '') {
      return value.toLowerCase().startsWith('ko') ? 'ko' : 'en';
    }
  }
  return 'en';
}

/**
 * Render an error message. `params.expected` may be a language neutral code such as
 * "positive-int"; it is replaced by the description in the chosen language (`exp.<code>`).
 */
export function renderError(
  lang: Lang,
  code: string,
  params: Record<string, string | number> = {},
): string {
  const filled: Record<string, string | number> = { ...params };
  const expected = params.expected;
  if (typeof expected === 'string') {
    const key = ('exp.' + expected) as MessageKey;
    if (key in messages[lang]) filled.expected = t(lang, key, params);
  }
  return t(lang, ('err.' + code) as MessageKey, filled);
}
