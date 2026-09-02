import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { recordMonitorEvent } from "./monitor.js";

export type CleanupStats = {
  convert: { removed: number; bytes: number };
  remote: { removed: number; bytes: number };
  temp: { removed: number; bytes: number };
  capacity: { removed: number; bytes: number };
};

type TrackedFile = {
  abs: string;
  size: number;
  mtimeMs: number;
  bucket: "convert" | "remote" | "temp";
};

function emptyBucket() {
  return { removed: 0, bytes: 0 };
}

async function unlinkQuiet(abs: string): Promise<number> {
  try {
    const st = await fs.stat(abs);
    const size = st.isFile() ? st.size : 0;
    await fs.rm(abs, { recursive: true, force: true });
    return size;
  } catch {
    return 0;
  }
}

async function listFilesRecursive(
  dir: string,
  filter?: (rel: string, abs: string) => boolean,
): Promise<TrackedFile[]> {
  const out: TrackedFile[] = [];
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const abs = path.join(dir, name);
    let st;
    try {
      st = await fs.stat(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      // temp 下的 arc-* / serve-* 工作目录按目录 mtime 整删；remote-cache 单独处理
      if (filter && !filter(name, abs)) continue;
      out.push({
        abs,
        size: 0,
        mtimeMs: st.mtimeMs,
        bucket: "temp",
      });
      continue;
    }
    if (!st.isFile()) continue;
    if (filter && !filter(name, abs)) continue;
    out.push({
      abs,
      size: st.size,
      mtimeMs: st.mtimeMs,
      bucket: "temp",
    });
  }
  return out;
}

async function purgeConvert(now: number, stats: CleanupStats): Promise<TrackedFile[]> {
  const ttl = config.cache.ttlMs;
  const kept: TrackedFile[] = [];
  let names: string[] = [];
  try {
    names = await fs.readdir(config.cacheDir);
  } catch {
    return kept;
  }
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const abs = path.join(config.cacheDir, name);
    try {
      const st = await fs.stat(abs);
      if (!st.isFile()) continue;
      const age = now - st.mtimeMs;
      if (ttl > 0 && age > ttl) {
        const bytes = await unlinkQuiet(abs);
        stats.convert.removed += 1;
        stats.convert.bytes += bytes;
      } else {
        kept.push({
          abs,
          size: st.size,
          mtimeMs: st.mtimeMs,
          bucket: "convert",
        });
      }
    } catch {
      // ignore
    }
  }
  return kept;
}

async function purgeRemote(now: number, stats: CleanupStats): Promise<TrackedFile[]> {
  const ttl = config.cache.remoteTtlMs;
  const dir = path.join(config.tempDir, "remote-cache");
  const kept: TrackedFile[] = [];
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return kept;
  }

  const ids = new Set<string>();
  for (const name of names) {
    const m = /^([a-f0-9]{40})\./i.exec(name);
    if (m) ids.add(m[1].toLowerCase());
  }

  for (const id of ids) {
    const metaPath = path.join(dir, `${id}.meta.json`);
    const related = names.filter((n) => n.startsWith(`${id}.`));
    let cachedAt = 0;
    try {
      const meta = JSON.parse(await fs.readFile(metaPath, "utf8")) as {
        cachedAt?: number;
      };
      if (typeof meta.cachedAt === "number") cachedAt = meta.cachedAt;
    } catch {
      // fall through to mtime
    }

    let newestMtime = 0;
    let totalSize = 0;
    const fileAbs: string[] = [];
    for (const name of related) {
      const abs = path.join(dir, name);
      try {
        const st = await fs.stat(abs);
        if (!st.isFile()) continue;
        newestMtime = Math.max(newestMtime, st.mtimeMs);
        if (!name.endsWith(".meta.json") && !name.endsWith(".part")) {
          totalSize += st.size;
          fileAbs.push(abs);
        } else {
          fileAbs.push(abs);
        }
      } catch {
        // ignore
      }
    }

    const stamp = cachedAt || newestMtime;
    const expired = ttl > 0 && stamp > 0 && now - stamp > ttl;
    // 残留 .part 超过 1 小时也清掉
    const stalePart =
      related.some((n) => n.endsWith(".part")) &&
      newestMtime > 0 &&
      now - newestMtime > 60 * 60 * 1000;

    if (expired || stalePart) {
      for (const abs of fileAbs) {
        const bytes = await unlinkQuiet(abs);
        stats.remote.removed += 1;
        stats.remote.bytes += bytes;
      }
      continue;
    }

    for (const abs of fileAbs) {
      if (abs.endsWith(".meta.json") || abs.endsWith(".part")) continue;
      try {
        const st = await fs.stat(abs);
        kept.push({
          abs,
          size: st.size,
          mtimeMs: cachedAt || st.mtimeMs,
          bucket: "remote",
        });
      } catch {
        // ignore
      }
    }
    void totalSize;
  }
  return kept;
}

async function purgeTemp(now: number, stats: CleanupStats): Promise<TrackedFile[]> {
  const ttl = config.cache.tempTtlMs;
  const kept: TrackedFile[] = [];
  const entries = await listFilesRecursive(config.tempDir, (name) => {
    return name !== "remote-cache";
  });

  for (const entry of entries) {
    const age = now - entry.mtimeMs;
    const isPart = entry.abs.endsWith(".part");
    const expired =
      (ttl > 0 && age > ttl) || (isPart && age > 60 * 60 * 1000);
    if (expired) {
      const bytes = await unlinkQuiet(entry.abs);
      stats.temp.removed += 1;
      stats.temp.bytes += bytes;
    } else {
      // 目录无法准确计 size，容量回收时跳过目录；仅跟踪文件
      try {
        const st = await fs.stat(entry.abs);
        if (st.isFile()) {
          kept.push({ ...entry, size: st.size, bucket: "temp" });
        }
      } catch {
        // ignore
      }
    }
  }
  return kept;
}

async function enforceCapacity(
  kept: TrackedFile[],
  stats: CleanupStats,
): Promise<void> {
  const maxBytes = config.cache.maxBytes;
  if (maxBytes <= 0) return;

  let total = kept.reduce((sum, f) => sum + f.size, 0);
  if (total <= maxBytes) return;

  kept.sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const file of kept) {
    if (total <= maxBytes) break;
    const bytes = await unlinkQuiet(file.abs);
    if (!bytes) continue;
    total -= bytes;
    stats.capacity.removed += 1;
    stats.capacity.bytes += bytes;
    // 远程缓存：顺带删同 id 的 meta
    const base = path.basename(file.abs);
    const m = /^([a-f0-9]{40})\./i.exec(base);
    if (m && file.bucket === "remote") {
      const meta = path.join(path.dirname(file.abs), `${m[1]}.meta.json`);
      await unlinkQuiet(meta);
    }
  }
}

export async function runCacheCleanup(): Promise<CleanupStats> {
  const now = Date.now();
  const stats: CleanupStats = {
    convert: emptyBucket(),
    remote: emptyBucket(),
    temp: emptyBucket(),
    capacity: emptyBucket(),
  };

  const convertKept = await purgeConvert(now, stats);
  const remoteKept = await purgeRemote(now, stats);
  const tempKept = await purgeTemp(now, stats);
  await enforceCapacity([...convertKept, ...remoteKept, ...tempKept], stats);

  const removed =
    stats.convert.removed +
    stats.remote.removed +
    stats.temp.removed +
    stats.capacity.removed;
  if (removed > 0) {
    recordMonitorEvent({
      kind: "cache-clear",
      level: "info",
      message: `自动清理缓存：convert=${stats.convert.removed} remote=${stats.remote.removed} temp=${stats.temp.removed} capacity=${stats.capacity.removed}`,
      detail: stats as unknown as Record<string, unknown>,
    });
  }
  return stats;
}

/** 远程缓存是否仍在 TTL 内（无 meta 时用 mtime） */
export async function isRemoteCacheFresh(
  absPath: string,
  metaCachedAt?: number,
): Promise<boolean> {
  const ttl = config.cache.remoteTtlMs;
  if (ttl <= 0) return true;
  let stamp = metaCachedAt || 0;
  if (!stamp) {
    try {
      stamp = (await fs.stat(absPath)).mtimeMs;
    } catch {
      return false;
    }
  }
  return Date.now() - stamp <= ttl;
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export function startCacheCleanupScheduler(): void {
  const interval = config.cache.cleanupIntervalMs;
  if (interval <= 0) return;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runCacheCleanup();
    } catch (err) {
      recordMonitorEvent({
        kind: "cache-clear",
        level: "error",
        message: "自动清理缓存失败",
        detail: {
          error: err instanceof Error ? err.message : String(err),
        },
      });
    } finally {
      running = false;
    }
  };

  // 启动稍后跑一次，避免拖慢 listen
  setTimeout(() => {
    void tick();
  }, 15_000);

  timer = setInterval(() => {
    void tick();
  }, interval);
  timer.unref?.();
}

export function stopCacheCleanupScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
