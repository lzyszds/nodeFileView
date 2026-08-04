import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import mime from "mime-types";
import { config } from "../config.js";
import { getExt, isAllowedUploadExt } from "../utils/ext.js";
import { ensureDir, safeJoin, sanitizeFilename } from "../utils/path.js";
import { recordMonitorEvent } from "./monitor.js";
import { assertSafeRemoteUrl } from "./security/ssrf.js";

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

export async function findCachedRemote(
  remoteUrl: string,
): Promise<{ absPath: string; filename: string; ext: string } | null> {
  const id = remoteCacheId(remoteUrl);
  const dir = cacheDir();
  try {
    const names = await fs.readdir(dir);
    const hit = names.find(
      (n) =>
        n.startsWith(`${id}.`) &&
        !n.endsWith(".part") &&
        !n.endsWith(".meta.json"),
    );
    if (!hit) return null;
    const absPath = safeJoin(dir, hit);
    const ext = getExt(hit);
    const metaName = `${id}.meta.json`;
    let filename = hit;
    try {
      const meta = JSON.parse(
        await fs.readFile(safeJoin(dir, metaName), "utf8"),
      ) as { filename?: string };
      if (meta.filename) filename = meta.filename;
    } catch {
      // ignore
    }
    return { absPath, filename, ext };
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
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
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
    let ext = getExt(filename);
    if (!ext) {
      const fromMime = mime.extension(res.headers.get("content-type") || "");
      ext = fromMime || "bin";
      if (!getExt(filename)) filename = `${filename}.${ext}`;
    }
    if (!isAllowedUploadExt(ext)) {
      throw new Error(`Remote file type .${ext} is not allowed`);
    }

    const finalName = `${id}.${ext}`;
    const absPath = safeJoin(dir, finalName);
    const partPath = safeJoin(dir, `${finalName}.part`);
    if (force && existsSync(absPath)) {
      await fs.unlink(absPath).catch(() => undefined);
    }

    const fileStream = createWriteStream(partPath);
    await pipeline(res.body as unknown as NodeJS.ReadableStream, fileStream);

    const stat = await fs.stat(partPath);
    if (stat.size > config.maxUploadSizeBytes) {
      await fs.unlink(partPath).catch(() => undefined);
      throw new Error("Remote file exceeds max size");
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
