import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import mime from "mime-types";
import { config } from "../config.js";
import {
  ARCHIVE_EXTS,
  getExt,
  isAllowedUploadExt,
  resolvePreviewKind,
} from "../utils/ext.js";
import { ensureDir, safeJoin, sanitizeFilename } from "../utils/path.js";
import { createMaxBytesTransform } from "../utils/streamLimit.js";
import { isRemoteCacheFresh } from "./cacheCleanup.js";
import { recordMonitorEvent } from "./monitor.js";
import { assertSafeRemoteUrl, safeFetch } from "./security/ssrf.js";

export function remoteCacheId(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 40);
}

type HotRemoteEntry = {
  hit: { absPath: string; filename: string; ext: string };
  size: number;
  expires: number;
};

const hotRemote = new Map<string, HotRemoteEntry>();
const HOT_REMOTE_CAP = 2000;

function getHotRemote(id: string): HotRemoteEntry | null {
  const entry = hotRemote.get(id);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    hotRemote.delete(id);
    return null;
  }
  return entry;
}

function setHotRemote(
  id: string,
  hit: { absPath: string; filename: string; ext: string },
  size: number,
): void {
  const ttl = config.hotRemoteCacheMs;
  if (ttl <= 0) return;
  if (hotRemote.size >= HOT_REMOTE_CAP) {
    const oldest = hotRemote.keys().next().value;
    if (oldest) hotRemote.delete(oldest);
  }
  hotRemote.set(id, {
    hit,
    size,
    expires: Date.now() + ttl,
  });
}

export function invalidateHotRemote(remoteUrl: string): void {
  hotRemote.delete(remoteCacheId(remoteUrl));
}

function cacheDir(): string {
  const dir = path.join(config.tempDir, "remote-cache");
  ensureDir(dir);
  return dir;
}

export function remoteProxyUrl(remoteUrl: string, force = false): string {
  const qs = new URLSearchParams();
  qs.set("url", remoteUrl);
  if (force) qs.set("force", "1");
  return `/api/remote?${qs.toString()}`;
}

function extFromUrlString(remoteUrl: string): string {
  try {
    return getExt(new URL(remoteUrl).pathname);
  } catch {
    return getExt(remoteUrl);
  }
}

/** ZIP local file header / empty archive / spanning markers */
async function looksLikeZip(absPath: string): Promise<boolean> {
  try {
    const fh = await fs.open(absPath, "r");
    try {
      const buf = Buffer.alloc(4);
      const { bytesRead } = await fh.read(buf, 0, 4, 0);
      if (bytesRead < 4) return false;
      return (
        buf[0] === 0x50 &&
        buf[1] === 0x4b &&
        (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)
      );
    } finally {
      await fh.close();
    }
  } catch {
    return false;
  }
}

/**
 * 解析远程文件最终扩展名：URL 路径 > 文件名 > MIME > 魔数。
 * CDN 常把 zip 标成 octet-stream / 无后缀文件名。
 */
export async function resolveRemoteExt(opts: {
  remoteUrl: string;
  filename: string;
  contentType?: string | null;
  absPath?: string;
}): Promise<{ ext: string; filename: string }> {
  let filename = sanitizeFilename(opts.filename);
  const urlExt = extFromUrlString(opts.remoteUrl);
  const nameExt = getExt(filename);
  const mimeExt = (mime.extension(opts.contentType || "") || "").toLowerCase();
  let ext = "";

  const usable = (e: string) =>
    Boolean(e) && e !== "bin" && resolvePreviewKind(e) !== "unsupported";

  if (usable(urlExt)) ext = urlExt;
  else if (usable(nameExt)) ext = nameExt;
  else if (usable(mimeExt)) ext = mimeExt;
  else if (opts.absPath && (await looksLikeZip(opts.absPath))) ext = "zip";
  else if (urlExt) ext = urlExt;
  else if (nameExt) ext = nameExt;
  else if (mimeExt) ext = mimeExt;
  else ext = "bin";

  if (!getExt(filename) || getExt(filename) !== ext) {
    const stem =
      (getExt(filename) ? filename.replace(/\.[^.]+$/, "") : filename) ||
      `remote-${remoteCacheId(opts.remoteUrl).slice(0, 8)}`;
    filename = sanitizeFilename(`${stem}.${ext}`);
  }

  return { ext, filename };
}

export async function findCachedRemote(
  remoteUrl: string,
): Promise<{ absPath: string; filename: string; ext: string } | null> {
  const id = remoteCacheId(remoteUrl);
  const hot = getHotRemote(id);
  if (hot) return hot.hit;

  const dir = cacheDir();
  const urlExt = extFromUrlString(remoteUrl);
  try {
    const names = await fs.readdir(dir);
    const candidates = names.filter(
      (n) =>
        n.startsWith(`${id}.`) &&
        !n.endsWith(".part") &&
        !n.endsWith(".meta.json"),
    );
    if (!candidates.length) return null;

    // 优先命中与 URL 后缀一致的缓存，避免旧的 .bin 脏缓存盖住 .zip
    const preferred =
      (urlExt && candidates.find((n) => n === `${id}.${urlExt}`)) ||
      (urlExt &&
        ARCHIVE_EXTS.has(urlExt) &&
        candidates.find((n) => ARCHIVE_EXTS.has(getExt(n)))) ||
      candidates.find((n) => getExt(n) !== "bin") ||
      candidates[0];

    if (!preferred) return null;

    // URL 明确是压缩包，但缓存却是 bin/unknown → 视为未命中，强制重拉
    const hitExt = getExt(preferred);
    if (
      urlExt &&
      ARCHIVE_EXTS.has(urlExt) &&
      hitExt !== urlExt &&
      !ARCHIVE_EXTS.has(hitExt)
    ) {
      return null;
    }

    const absPath = safeJoin(dir, preferred);
    let ext = hitExt;
    const metaName = `${id}.meta.json`;
    let filename = preferred;
    let cachedAt: number | undefined;
    try {
      const meta = JSON.parse(
        await fs.readFile(safeJoin(dir, metaName), "utf8"),
      ) as { filename?: string; ext?: string; cachedAt?: number };
      if (meta.filename) filename = meta.filename;
      if (meta.ext) ext = getExt(`x.${meta.ext}`) || ext;
      if (typeof meta.cachedAt === "number") cachedAt = meta.cachedAt;
    } catch {
      // ignore
    }

    if (!(await isRemoteCacheFresh(absPath, cachedAt))) {
      return null;
    }

    const resolved = await resolveRemoteExt({
      remoteUrl,
      filename,
      absPath,
    });
    const hit = {
      absPath,
      filename: resolved.filename,
      ext: resolved.ext || ext,
    };
    try {
      const st = await fs.stat(absPath);
      setHotRemote(id, hit, st.size);
    } catch {
      // ignore
    }
    return hit;
  } catch {
    return null;
  }
}

type RemoteCachedFile = {
  absPath: string;
  filename: string;
  ext: string;
  size: number;
};

/** 同 URL 并发下载合并为一次，避免互相删掉 .part */
const inflightDownloads = new Map<string, Promise<RemoteCachedFile>>();

async function downloadRemoteCachedOnce(
  remoteUrl: string,
  force: boolean,
): Promise<RemoteCachedFile> {
  if (!force) {
    const hit = await findCachedRemote(remoteUrl);
    if (hit) {
      const stat = await fs.stat(hit.absPath);
      recordMonitorEvent({
        kind: "remote-cache",
        level: "info",
        message: `远程缓存命中：${hit.filename}`,
        detail: { filename: hit.filename, ext: hit.ext },
        cacheHit: true,
      });
      setHotRemote(remoteCacheId(remoteUrl), hit, stat.size);
      return { ...hit, size: stat.size };
    }
  }

  const url = await assertSafeRemoteUrl(remoteUrl);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    config.remoteDownloadTimeoutMs,
  );
  const id = remoteCacheId(remoteUrl);
  const dir = cacheDir();
  const started = Date.now();
  // 用唯一 part 名，避免并发写同一文件；完成后 rename 到最终名
  const partPath = safeJoin(dir, `${id}.${process.pid}.${Date.now()}.part`);

  try {
    const res = await safeFetch(url.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": "filePreview/1.0" },
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
      : path.basename(url.pathname) || `remote-${id.slice(0, 8)}`;
    filename = sanitizeFilename(filename);

    const fileStream = createWriteStream(partPath);
    await pipeline(
      res.body as unknown as NodeJS.ReadableStream,
      createMaxBytesTransform(config.maxUploadSizeBytes),
      fileStream,
    );

    const stat = await fs.stat(partPath);
    if (stat.size > config.maxUploadSizeBytes) {
      await fs.unlink(partPath).catch(() => undefined);
      throw new Error("Remote file exceeds max size");
    }

    const resolved = await resolveRemoteExt({
      remoteUrl,
      filename,
      contentType: res.headers.get("content-type"),
      absPath: partPath,
    });
    filename = resolved.filename;
    const ext = resolved.ext;

    if (!isAllowedUploadExt(ext)) {
      await fs.unlink(partPath).catch(() => undefined);
      throw new Error(`Remote file type .${ext} is not allowed`);
    }

    // 下载期间另一路可能已写好缓存，优先复用
    if (!force) {
      const raced = await findCachedRemote(remoteUrl);
      if (raced) {
        await fs.unlink(partPath).catch(() => undefined);
        const racedStat = await fs.stat(raced.absPath);
        recordMonitorEvent({
          kind: "remote-cache",
          level: "info",
          message: `远程缓存命中：${raced.filename}`,
          detail: { filename: raced.filename, ext: raced.ext, coalesced: true },
          cacheHit: true,
        });
        return { ...raced, size: racedStat.size };
      }
    }

    const finalName = `${id}.${ext}`;
    const absPath = safeJoin(dir, finalName);
    if (existsSync(absPath)) {
      await fs.unlink(absPath).catch(() => undefined);
    }
    // 清掉同 id 的脏缓存（例如旧的 .bin），保留本次 part / meta
    try {
      const names = await fs.readdir(dir);
      await Promise.all(
        names
          .filter(
            (n) =>
              n.startsWith(`${id}.`) &&
              n !== finalName &&
              !n.endsWith(".part") &&
              !n.endsWith(".meta.json"),
          )
          .map((n) => fs.unlink(safeJoin(dir, n)).catch(() => undefined)),
      );
    } catch {
      // ignore
    }

    await fs.rename(partPath, absPath);
    await fs.writeFile(
      safeJoin(dir, `${id}.meta.json`),
      JSON.stringify({ filename, ext, url: remoteUrl, cachedAt: Date.now() }),
    );

    recordMonitorEvent({
      kind: "remote-cache",
      level: "info",
      message: `远程下载并缓存：${filename}`,
      detail: { filename, ext, size: stat.size, force },
      durationMs: Date.now() - started,
      cacheHit: false,
    });

    setHotRemote(id, { absPath, filename, ext }, stat.size);
    return { absPath, filename, ext, size: stat.size };
  } catch (err) {
    await fs.unlink(partPath).catch(() => undefined);
    recordMonitorEvent({
      kind: "remote-cache",
      level: "error",
      message: `远程拉取失败`,
      detail: {
        url: remoteUrl.slice(0, 120),
        error: err instanceof Error ? err.message : String(err),
      },
      durationMs: Date.now() - started,
      cacheHit: false,
    });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadRemoteCached(
  remoteUrl: string,
  force = false,
): Promise<RemoteCachedFile> {
  if (force) invalidateHotRemote(remoteUrl);

  const lockKey = `${force ? "force:" : ""}${remoteCacheId(remoteUrl)}`;
  const existing = inflightDownloads.get(lockKey);
  if (existing) return existing;

  const job = downloadRemoteCachedOnce(remoteUrl, force).finally(() => {
    if (inflightDownloads.get(lockKey) === job) {
      inflightDownloads.delete(lockKey);
    }
  });
  inflightDownloads.set(lockKey, job);
  return job;
}

export function openCachedRemoteStream(absPath: string) {
  return createReadStream(absPath);
}
