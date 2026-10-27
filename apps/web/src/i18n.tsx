import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ID } from './locales/id.ts';

/**
 * Minimal, dependency-free translation. The English text IS the key: `t('Browse skills')`. A missing Indonesian
 * entry falls back to the English text, so a gap is never blank or a raw key. `{name}` placeholders are filled
 * from params. Registry content (skill descriptions, review findings, evidence notes) is data, not interface text,
 * and is shown as written.
 */
export const LANGS = ['en', 'id'] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_NAME: Record<Lang, string> = { en: 'English', id: 'Bahasa Indonesia' };

export type TParams = Record<string, string | number>;
export type T = (text: string, params?: TParams) => string;

const fill = (s: string, params?: TParams) =>
  params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;

export function translate(lang: Lang, text: string, params?: TParams): string {
  return fill(lang === 'id' ? (ID[text] ?? text) : text, params);
}
/** The English translator: what components get when no provider is mounted (tests, server rendering). */
export const tEn: T = (text, params) => translate('en', text, params);

/** Stored choice wins; otherwise the browser language (Indonesian if it starts with "id"); otherwise English. */
export function detectLang(
  stored: string | null | undefined,
  navigatorLang: string | undefined,
): Lang {
  if (stored === 'en' || stored === 'id') return stored;
  return /^id\b/i.test(navigatorLang ?? '') ? 'id' : 'en';
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: T }>({
  lang: 'en',
  setLang: () => {},
  t: tEn,
});
export const useI18n = () => useContext(Ctx);
export const useT = (): T => useContext(Ctx).t;

function initialLang(): Lang {
  try {
    return detectLang(localStorage.getItem('lang'), navigator.language);
  } catch {
    return 'en';
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo(
    () => ({
      lang,
      setLang: (l: Lang) => {
        setLangState(l);
        try {
          localStorage.setItem('lang', l);
        } catch {
          /* storage unavailable: the choice lasts for this visit only */
        }
      },
      t: ((text, params) => translate(lang, text, params)) as T,
    }),
    [lang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** English / Bahasa Indonesia switch. Both options stay visible; the active one is marked with aria-pressed. */
export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t('Language')}
      className="flex rounded-lg border border-zinc-300 p-0.5 text-xs font-medium dark:border-zinc-700"
    >
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          title={LANG_NAME[l]}
          aria-label={LANG_NAME[l]}
          onClick={() => setLang(l)}
          className="rounded-md px-2 py-1.5 text-zinc-600 hover:text-zinc-900 aria-pressed:bg-indigo-600 aria-pressed:text-white dark:text-zinc-400 dark:hover:text-zinc-100 dark:aria-pressed:bg-indigo-500 dark:aria-pressed:text-white"
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
