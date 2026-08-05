import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
export const LANG_COOKIE = "nfv_lang";

type Dict = Record<string, unknown>;

const localeStore = new AsyncLocalStorage<Locale>();
const catalog = new Map<Locale, Dict>();

function localesDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "locales"),
    path.resolve(here, "../../../../locales"),
    path.resolve(here, "../../../locales"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "zh.json"))) return dir;
  }
  return candidates[0]!;
}

function loadLocale(locale: Locale): Dict {
  const cached = catalog.get(locale);
  if (cached) return cached;
  const file = path.join(localesDir(), `${locale}.json`);
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Dict;
  catalog.set(locale, raw);
  return raw;
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

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(
  preferred?: string | null,
  acceptLanguage?: string | null,
): Locale {
  if (preferred) {
    const direct = preferred.trim();
    if (isLocale(direct)) return direct;
    const lower = direct.toLowerCase();
    if (lower === "zh-cn" || lower === "zh-hans") return "zh";
    if (lower === "zh-tw" || lower === "zh-hant") return "zh-HK";
    const base = lower.split("-")[0] || "";
    if (isLocale(base)) return base;
  }

  if (acceptLanguage) {
    const tags = acceptLanguage
      .split(",")
      .map((part) => {
        const [tag, qPart] = part.trim().split(";");
        const q = qPart?.startsWith("q=")
          ? Number(qPart.slice(2))
          : 1;
        return { tag: (tag || "").trim(), q: Number.isFinite(q) ? q : 1 };
      })
      .filter((x) => x.tag)
      .sort((a, b) => b.q - a.q);

    for (const { tag } of tags) {
      if (isLocale(tag)) return tag;
      const lower = tag.toLowerCase();
      if (lower.startsWith("zh-hk") || lower.startsWith("zh-tw") || lower.startsWith("zh-hant")) {
        return "zh-HK";
      }
      if (lower.startsWith("zh")) return "zh";
      const base = lower.split("-")[0] || "";
      if (isLocale(base)) return base;
    }
  }

  return DEFAULT_LOCALE;
}

export function runWithLocale<T>(locale: Locale, fn: () => T): T {
  return localeStore.run(locale, fn);
}

export function currentLocale(): Locale {
  return localeStore.getStore() || DEFAULT_LOCALE;
}

export function htmlLang(locale: Locale = currentLocale()): string {
  const v = getPath(loadLocale(locale), "meta.htmlLang");
  return v || locale;
}

export function t(
  key: string,
  vars?: Record<string, string | number>,
  locale: Locale = currentLocale(),
): string {
  const primary = getPath(loadLocale(locale), key);
  const fallback =
    primary ??
    getPath(loadLocale("en"), key) ??
    getPath(loadLocale("zh"), key) ??
    key;
  if (!vars) return fallback;
  return fallback.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`,
  );
}

export function parseCookieHeader(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

export function localeFromRequest(opts: {
  queryLang?: string;
  cookieHeader?: string;
  acceptLanguage?: string;
}): Locale {
  const fromQuery = opts.queryLang?.trim();
  const fromCookie = parseCookieHeader(opts.cookieHeader, LANG_COOKIE);
  return resolveLocale(fromQuery || fromCookie, opts.acceptLanguage);
}

/** Flat preview UI bag for embedding into viewer scripts */
export function previewUi(locale: Locale = currentLocale()): Record<string, string> {
  const keys = [
    "common.refresh",
    "preview.zoomIn",
    "preview.zoomOut",
    "preview.rotate",
    "preview.flipH",
    "preview.flipV",
    "preview.prevPage",
    "preview.nextPage",
    "preview.fullscreen",
    "preview.download",
    "preview.print",
    "preview.edit",
    "preview.doneEdit",
    "preview.toc",
    "preview.refreshToc",
    "preview.fitWidth",
    "preview.fitPage",
    "preview.loadingEngine",
    "preview.loadingDoc",
    "preview.parsingDoc",
    "preview.imageFailed",
    "preview.excelFailed",
    "preview.pptxFailed",
    "preview.docxFailed",
    "preview.mediaAudio",
    "preview.mediaVideo",
    "preview.htmlPreview",
    "preview.htmlSource",
    "preview.htmlShowSource",
    "preview.htmlBackPreview",
    "preview.archiveTree",
    "preview.archiveBack",
    "preview.archiveRoot",
    "preview.archiveEmpty",
    "preview.archiveFolder",
    "preview.archiveFiles",
    "preview.archiveImageFail",
    "preview.rowHeight",
    "preview.colWidth",
    "preview.failedTitle",
    "preview.unsupported",
    "preview.unsupportedHint",
    "preview.passwordTitle",
    "preview.passwordProtected",
    "preview.passwordWrong",
    "preview.passwordPlaceholder",
    "preview.passwordSubmit",
  ] as const;

  const out: Record<string, string> = {};
  for (const key of keys) {
    const name = key.startsWith("common.")
      ? key.slice("common.".length)
      : key.slice("preview.".length);
    out[name] = t(key, undefined, locale);
  }
  return out;
}
