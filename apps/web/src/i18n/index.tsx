import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import en from "@locales/en.json";
import id from "@locales/id.json";
import ja from "@locales/ja.json";
import ko from "@locales/ko.json";
import ms from "@locales/ms.json";
import th from "@locales/th.json";
import vi from "@locales/vi.json";
import zhHK from "@locales/zh-HK.json";
import zh from "@locales/zh.json";

export const LOCALES = [
  "zh",
  "zh-HK",
  "en",
  "ja",
  "ko",
  "th",
  "vi",
  "id",
  "ms",
] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "zh";
export const LANG_STORAGE_KEY = "nfv_lang";
export const LANG_COOKIE = "nfv_lang";

type Dict = Record<string, unknown>;

const catalogs: Record<Locale, Dict> = {
  en: en as Dict,
  zh: zh as Dict,
  "zh-HK": zhHK as Dict,
  ja: ja as Dict,
  ko: ko as Dict,
  th: th as Dict,
  vi: vi as Dict,
  id: id as Dict,
  ms: ms as Dict,
};

function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

function getPath(dict: Dict, key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = dict;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Dict)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function resolveBrowserLocale(): Locale {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* ignore */
  }

  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  if (nav) {
    const lower = nav.toLowerCase();
    if (lower.startsWith("zh-hk") || lower.startsWith("zh-tw") || lower.startsWith("zh-hant")) {
      return "zh-HK";
    }
    if (lower.startsWith("zh")) return "zh";
    const base = lower.split("-")[0] || "";
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const primary = getPath(catalogs[locale], key);
  const fallback =
    primary ??
    getPath(catalogs.en, key) ??
    getPath(catalogs.zh, key) ??
    key;
  if (!vars) return fallback;
  return fallback.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`,
  );
}

export function localeLabel(locale: Locale): string {
  return translate(locale, "meta.name");
}

function writeLangCookie(locale: Locale) {
  try {
    document.cookie = `${LANG_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => resolveBrowserLocale());

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    writeLangCookie(next);
    document.documentElement.lang =
      translate(next, "meta.htmlLang") || next;
  }, []);

  useEffect(() => {
    writeLangCookie(locale);
    document.documentElement.lang =
      translate(locale, "meta.htmlLang") || locale;
  }, [locale]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useT() {
  return useI18n().t;
}
