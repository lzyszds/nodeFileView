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
import { recordMonitorEvent } from "./monitor.js";
import { assertSafeRemoteUrl, safeFetch } from "./security/ssrf.js";

export function remoteCacheId(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 40);
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
    try {
      const meta = JSON.parse(
        await fs.readFile(safeJoin(dir, metaName), "utf8"),
      ) as { filename?: string; ext?: string };
      if (meta.filename) filename = meta.filename;
      if (meta.ext) ext = getExt(`x.${meta.ext}`) || ext;
    } catch {
      // ignore
    }

    const resolved = await resolveRemoteExt({
      remoteUrl,
      filename,
      absPath,
    });
    return { absPath, filename: resolved.filename, ext: resolved.ext || ext };
  } catch {
    return null;
  }
}

export async function downloadRemoteCached(
  remoteUrl: string,
  force = false,
): Promise<{ absPath: string; filename: string; ext: string; size: number }> {
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
      return { ...hit, size: stat.size };
    }
  }

  const url = await assertSafeRemoteUrl(remoteUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  const id = remoteCacheId(remoteUrl);
  const dir = cacheDir();
  const started = Date.now();

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
      : path.basename(url.pathname) || `remote-${id.slice(0, 8)}`;
    filename = sanitizeFilename(filename);

    // 先落到临时文件，再按魔数纠正扩展名
    const partPath = safeJoin(dir, `${id}.part`);
    const fileStream = createWriteStream(partPath);
    await pipeline(res.body as unknown as NodeJS.ReadableStream, fileStream);

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

    const finalName = `${id}.${ext}`;
    const absPath = safeJoin(dir, finalName);
    if (existsSync(absPath)) {
      await fs.unlink(absPath).catch(() => undefined);
    }
    // 清掉同 id 的脏缓存（例如旧的 .bin）
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

    return { absPath, filename, ext, size: stat.size };
  } catch (err) {
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

export function openCachedRemoteStream(absPath: string) {
  return createReadStream(absPath);
}
