import fs from "node:fs/promises";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { nanoid } from "nanoid";
import mime from "mime-types";
import { config } from "../config.js";
import { getExt, isAllowedUploadExt } from "../utils/ext.js";
import { ensureDir, safeJoin, sanitizeFilename } from "../utils/path.js";
import { assertSafeRemoteUrl, safeFetch } from "./security/ssrf.js";

export interface StoredFile {
  fileId: string;
  name: string;
  originalName: string;
  size: number;
  ext: string;
  mime: string;
  createdAt: string;
  path: string;
}

interface MetaIndex {
  files: Record<string, StoredFile>;
}

function metaPath(): string {
  return path.join(config.uploadsDir, "_meta.json");
}

async function readMeta(): Promise<MetaIndex> {
  try {
    const raw = await fs.readFile(metaPath(), "utf8");
    return JSON.parse(raw) as MetaIndex;
  } catch {
    return { files: {} };
  }
}

async function writeMeta(meta: MetaIndex): Promise<void> {
  await fs.writeFile(metaPath(), JSON.stringify(meta, null, 2), "utf8");
}

export async function initFileStore(): Promise<void> {
  ensureDir(config.uploadsDir);
  ensureDir(config.cacheDir);
  ensureDir(config.tempDir);
  const meta = await readMeta();
  if (!meta.files) meta.files = {};
  await writeMeta(meta);
}

export async function saveUploadedFile(input: {
  filename: string;
  mimetype?: string;
  buffer: Buffer;
}): Promise<StoredFile> {
  const originalName = sanitizeFilename(input.filename);
  const ext = getExt(originalName);
  if (!ext || !isAllowedUploadExt(ext)) {
    throw new Error(`File type .${ext || "unknown"} is not allowed`);
  }
  if (input.buffer.length > config.maxUploadSizeBytes) {
    throw new Error("File exceeds max upload size");
  }

  const fileId = nanoid(16);
  const storedName = `${fileId}.${ext}`;
  const absPath = safeJoin(config.uploadsDir, storedName);
  await fs.writeFile(absPath, input.buffer);

  const record: StoredFile = {
    fileId,
    name: storedName,
    originalName,
    size: input.buffer.length,
    ext,
    mime: input.mimetype || mime.lookup(ext) || "application/octet-stream",
    createdAt: new Date().toISOString(),
    path: absPath,
  };

  const meta = await readMeta();
  meta.files[fileId] = { ...record, path: storedName };
  await writeMeta(meta);
  return record;
}

export async function listFiles(opts: {
  page: number;
  size: number;
  q?: string;
}): Promise<{ total: number; page: number; size: number; items: StoredFile[] }> {
  const meta = await readMeta();
  let items = Object.values(meta.files).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  if (opts.q) {
    const q = opts.q.toLowerCase();
    items = items.filter(
      (f) =>
        f.originalName.toLowerCase().includes(q) ||
        f.ext.toLowerCase().includes(q) ||
        f.fileId.toLowerCase().includes(q),
    );
  }
  const total = items.length;
  const start = (opts.page - 1) * opts.size;
  const pageItems = items.slice(start, start + opts.size).map((f) => ({
    ...f,
    path: safeJoin(config.uploadsDir, f.path),
  }));
  return { total, page: opts.page, size: opts.size, items: pageItems };
}

export async function getFile(fileId: string): Promise<StoredFile | null> {
  const meta = await readMeta();
  const record = meta.files[fileId];
  if (!record) return null;
  const abs = safeJoin(config.uploadsDir, record.path);
  try {
    await fs.access(abs);
  } catch {
    return null;
  }
  return { ...record, path: abs };
}

export async function deleteFile(fileId: string): Promise<boolean> {
  const meta = await readMeta();
  const record = meta.files[fileId];
  if (!record) return false;
  const abs = safeJoin(config.uploadsDir, record.path);
  try {
    await fs.unlink(abs);
  } catch {
    // ignore missing
  }
  delete meta.files[fileId];
  await writeMeta(meta);
  return true;
}

export function localFileUrl(fileId: string): string {
  return `file://local/${fileId}`;
}

export function parseLocalFileUrl(url: string): string | null {
  const m = /^file:\/\/local\/([A-Za-z0-9_-]+)$/.exec(url);
  return m?.[1] ?? null;
}

/**
 * 把已落盘的远程缓存文件登记/复制进 uploads，生成稳定 fileId，
 * 供压缩包浏览（/api/archive/:fileId）等需要 fileId 的能力使用。
 */
export async function ensureStoredFromDisk(opts: {
  absPath: string;
  originalName: string;
  ext: string;
  /** 稳定 id（如远程 URL 哈希），重复预览可复用 */
  stableId: string;
  force?: boolean;
}): Promise<StoredFile> {
  const ext = opts.ext.toLowerCase();
  if (!ext || !isAllowedUploadExt(ext)) {
    throw new Error(`File type .${ext || "unknown"} is not allowed`);
  }

  const fileId = opts.stableId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
  if (!fileId) throw new Error("Invalid stableId");

  if (!opts.force) {
    const existing = await getFile(fileId);
    if (existing) {
      try {
        const st = await fs.stat(opts.absPath);
        const destStat = await fs.stat(existing.path).catch(() => null);
        if (st.size === existing.size && destStat) return existing;
      } catch {
        // fall through and refresh
      }
    }
  }

  const originalName = sanitizeFilename(opts.originalName);
  const storedName = `${fileId}.${ext}`;
  const dest = safeJoin(config.uploadsDir, storedName);
  await fs.copyFile(opts.absPath, dest);

  const size = (await fs.stat(dest)).size;
  const record: StoredFile = {
    fileId,
    name: storedName,
    originalName,
    size,
    ext,
    mime: mime.lookup(ext) || "application/octet-stream",
    createdAt: new Date().toISOString(),
    path: storedName,
  };

  const meta = await readMeta();
  meta.files[fileId] = record;
  await writeMeta(meta);
  return { ...record, path: dest };
}

export async function downloadRemoteToTemp(
  remoteUrl: string,
): Promise<{ absPath: string; filename: string; ext: string; size: number }> {
  const url = await assertSafeRemoteUrl(remoteUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await safeFetch(url.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": "nodeFileView/1.0" },
    });
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download remote file: HTTP ${res.status}`);
    }

    const contentLength = Number(res.headers.get("content-length") || 0);
    if (contentLength > config.maxUploadSizeBytes) {
      throw new Error("Remote file exceeds max size");
    }

    const disposition = res.headers.get("content-disposition") || "";
    const nameMatch = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
    let filename = nameMatch
      ? decodeURIComponent(nameMatch[1].replace(/"/g, ""))
      : path.basename(url.pathname) || `remote-${nanoid(8)}`;
    filename = sanitizeFilename(filename);
    let ext = getExt(filename);
    if (!ext) {
      const fromMime = mime.extension(res.headers.get("content-type") || "");
      ext = fromMime || "bin";
      filename = `${filename}.${ext}`;
    }
    if (!isAllowedUploadExt(ext)) {
      throw new Error(`Remote file type .${ext} is not allowed`);
    }

    const tempName = `${nanoid(12)}.${ext}`;
    const absPath = safeJoin(config.tempDir, tempName);
    const fileStream = createWriteStream(absPath);
    await pipeline(res.body as unknown as NodeJS.ReadableStream, fileStream);

    const stat = await fs.stat(absPath);
    if (stat.size > config.maxUploadSizeBytes) {
      await fs.unlink(absPath).catch(() => undefined);
      throw new Error("Remote file exceeds max size");
    }

    return { absPath, filename, ext, size: stat.size };
  } finally {
    clearTimeout(timer);
  }
}
