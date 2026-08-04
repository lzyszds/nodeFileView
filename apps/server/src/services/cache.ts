import crypto from "node:crypto";
import fs from "node:fs/promises";
import { config } from "../config.js";
import { ensureDir, safeJoin } from "../utils/path.js";

export function cacheKey(parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

export function cachePathFor(key: string, ext = "pdf"): string {
  return safeJoin(config.cacheDir, `${key}.${ext}`);
}

export async function hasCache(key: string, ext = "pdf"): Promise<boolean> {
  try {
    await fs.access(cachePathFor(key, ext));
    return true;
  } catch {
    return false;
  }
}

export async function removeCache(key: string, ext = "pdf"): Promise<void> {
  try {
    await fs.unlink(cachePathFor(key, ext));
  } catch {
    // ignore
  }
}

export async function ensureCacheDir(): Promise<void> {
  ensureDir(config.cacheDir);
}

export async function writeCacheFile(
  key: string,
  sourcePath: string,
  ext = "pdf",
): Promise<string> {
  await ensureCacheDir();
  const dest = cachePathFor(key, ext);
  await fs.copyFile(sourcePath, dest);
  return dest;
}

export function cacheUrl(key: string, ext = "pdf"): string {
  return `/api/cache/${key}.${ext}`;
}
