export const OFFICE_EXTS = new Set([
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "tsv",
  "wps",
  "dps",
  "et",
  "ett",
  "wpt",
  "odt",
  "ods",
  "odp",
  "ott",
  "fodt",
  "fods",
  "pdf",
]);

export const IMAGE_EXTS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "webp",
  "svg",
  "tif",
  "tiff",
  "tga",
]);

export const TEXT_EXTS = new Set([
  "txt",
  "md",
  "markdown",
  "xml",
  "html",
  "htm",
  "json",
  "yaml",
  "yml",
  "java",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "css",
  "scss",
  "less",
  "py",
  "php",
  "go",
  "rs",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "rb",
  "sh",
  "bash",
  "sql",
  "ini",
  "conf",
  "log",
  "vue",
]);

export const ARCHIVE_EXTS = new Set(["zip", "jar", "tar", "gz", "tgz", "gzip"]);

export const MEDIA_EXTS = new Set([
  "mp3",
  "wav",
  "ogg",
  "mp4",
  "webm",
  "mov",
  "m4a",
  "flac",
]);

export const UNSUPPORTED_HINT = new Set([
  "heic",
  "rar",
  "7z",
  "avi",
  "flv",
  "mkv",
  "wmf",
  "emf",
]);

export const BLOCKED_EXTS = new Set([
  "exe",
  "bat",
  "cmd",
  "com",
  "msi",
  "scr",
  "ps1",
  "vbs",
  "dll",
  "so",
  "dylib",
]);

export type PreviewKind =
  | "office"
  | "pdf"
  | "image"
  | "text"
  | "archive"
  | "media"
  | "unsupported";

export function getExt(filename: string): string {
  const base = filename.split("?")[0]?.split("#")[0] ?? filename;
  const idx = base.lastIndexOf(".");
  if (idx < 0) return "";
  return base.slice(idx + 1).toLowerCase();
}

export function resolvePreviewKind(ext: string): PreviewKind {
  const e = ext.toLowerCase();
  if (e === "pdf") return "pdf";
  if (OFFICE_EXTS.has(e)) return "office";
  if (IMAGE_EXTS.has(e)) return "image";
  if (TEXT_EXTS.has(e)) return "text";
  if (ARCHIVE_EXTS.has(e)) return "archive";
  if (MEDIA_EXTS.has(e)) return "media";
  return "unsupported";
}

export function isAllowedUploadExt(ext: string): boolean {
  const e = ext.toLowerCase();
  if (BLOCKED_EXTS.has(e)) return false;
  return (
    OFFICE_EXTS.has(e) ||
    IMAGE_EXTS.has(e) ||
    TEXT_EXTS.has(e) ||
    ARCHIVE_EXTS.has(e) ||
    MEDIA_EXTS.has(e) ||
    UNSUPPORTED_HINT.has(e)
  );
}

export function isAudio(ext: string): boolean {
  return ["mp3", "wav", "ogg", "m4a", "flac"].includes(ext.toLowerCase());
}
