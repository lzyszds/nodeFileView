import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { redactMonitorDetail } from "./security/redact.js";
import { ensureDir } from "../utils/path.js";

export type MonitorEventKind =
  | "preview"
  | "convert"
  | "remote-cache"
  | "cache-clear"
  | "error";

export interface MonitorEvent {
  id: number;
  ts: number;
  kind: MonitorEventKind;
  level: "info" | "warn" | "error";
  message: string;
  detail?: Record<string, unknown>;
  durationMs?: number;
  cacheHit?: boolean;
}

export interface MonitorStats {
  startedAt: number;
  uptimeMs: number;
  previewTotal: number;
  previewToday: number;
  convertTotal: number;
  convertErrors: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  avgConvertMs: number;
  lastErrorAt: number | null;
}

export interface CacheInventory {
  convert: { count: number; bytes: number };
  remote: { count: number; bytes: number };
  temp: { count: number; bytes: number };
  totalBytes: number;
}

const MAX_LOGS = 500;
const persistPath = path.join(config.dataDir, "monitor-state.json");

const logs: MonitorEvent[] = [];
let nextId = 1;
const startedAt = Date.now();

let previewTotal = 0;
let convertTotal = 0;
let convertErrors = 0;
let cacheHits = 0;
let cacheMisses = 0;
let convertDurationSum = 0;
let convertDurationCount = 0;
let lastErrorAt: number | null = null;

const dayPreviewCounts = new Map<string, number>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let loaded = false;

function dayKey(ts = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistNow();
  }, 1000);
}

async function persistNow(): Promise<void> {
  try {
    ensureDir(config.dataDir);
    const payload = {
      nextId,
      previewTotal,
      convertTotal,
      convertErrors,
      cacheHits,
      cacheMisses,
      convertDurationSum,
      convertDurationCount,
      lastErrorAt,
      dayPreviewCounts: Object.fromEntries(dayPreviewCounts),
      logs,
    };
    await fsp.writeFile(persistPath, JSON.stringify(payload), "utf8");
  } catch {
    // ignore disk errors
  }
}

export async function flushMonitorStore(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await persistNow();
}

export function initMonitorStore(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (!fs.existsSync(persistPath)) {
      recordMonitorEvent({
        kind: "preview",
        level: "info",
        message: "监控服务已启动，等待预览/转码事件…",
        detail: { boot: true },
      });
      return;
    }
    const raw = JSON.parse(fs.readFileSync(persistPath, "utf8")) as {
      nextId?: number;
      previewTotal?: number;
      convertTotal?: number;
      convertErrors?: number;
      cacheHits?: number;
      cacheMisses?: number;
      convertDurationSum?: number;
      convertDurationCount?: number;
      lastErrorAt?: number | null;
      dayPreviewCounts?: Record<string, number>;
      logs?: MonitorEvent[];
    };
    nextId = Math.max(1, Number(raw.nextId) || 1);
    previewTotal = Number(raw.previewTotal) || 0;
    convertTotal = Number(raw.convertTotal) || 0;
    convertErrors = Number(raw.convertErrors) || 0;
    cacheHits = Number(raw.cacheHits) || 0;
    cacheMisses = Number(raw.cacheMisses) || 0;
    convertDurationSum = Number(raw.convertDurationSum) || 0;
    convertDurationCount = Number(raw.convertDurationCount) || 0;
    lastErrorAt = raw.lastErrorAt ?? null;
    dayPreviewCounts.clear();
    for (const [k, v] of Object.entries(raw.dayPreviewCounts || {})) {
      dayPreviewCounts.set(k, Number(v) || 0);
    }
    logs.length = 0;
    for (const item of Array.isArray(raw.logs) ? raw.logs : []) {
      if (!item || typeof item !== "object") continue;
      logs.push(item);
    }
    if (logs.length === 0) {
      recordMonitorEvent({
        kind: "preview",
        level: "info",
        message: "监控服务已启动，等待预览/转码事件…",
        detail: { boot: true },
      });
    }
  } catch {
    recordMonitorEvent({
      kind: "preview",
      level: "info",
      message: "监控服务已启动，等待预览/转码事件…",
      detail: { boot: true },
    });
  }
}

export function recordMonitorEvent(
  partial: Omit<MonitorEvent, "id" | "ts"> & { ts?: number },
): MonitorEvent {
  if (!loaded) initMonitorStore();
  const event: MonitorEvent = {
    id: nextId++,
    ts: partial.ts ?? Date.now(),
    kind: partial.kind,
    level: partial.level,
    message: partial.message,
    detail: redactMonitorDetail(partial.detail),
    durationMs: partial.durationMs,
    cacheHit: partial.cacheHit,
  };
  logs.unshift(event);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;

  if (event.kind === "preview" && !event.detail?.boot) {
    previewTotal += 1;
    const key = dayKey(event.ts);
    dayPreviewCounts.set(key, (dayPreviewCounts.get(key) || 0) + 1);
  }
  if (event.kind === "convert") {
    convertTotal += 1;
    if (typeof event.durationMs === "number" && event.durationMs >= 0) {
      convertDurationSum += event.durationMs;
      convertDurationCount += 1;
    }
  }
  if (event.cacheHit === true) cacheHits += 1;
  if (event.cacheHit === false) cacheMisses += 1;
  if (event.level === "error") {
    lastErrorAt = event.ts;
    if (event.kind === "convert") convertErrors += 1;
  }

  schedulePersist();
  return event;
}

export function getMonitorLogs(limit = 100): MonitorEvent[] {
  if (!loaded) initMonitorStore();
  const n = Math.min(Math.max(1, limit), MAX_LOGS);
  return logs.slice(0, n);
}

export function clearMonitorLogs(): number {
  if (!loaded) initMonitorStore();
  const n = logs.length;
  logs.length = 0;
  schedulePersist();
  recordMonitorEvent({
    kind: "cache-clear",
    level: "info",
    message: "监控日志已清空",
  });
  return n;
}

export function getMonitorStats(): MonitorStats {
  if (!loaded) initMonitorStore();
  const attempts = cacheHits + cacheMisses;
  const today = dayPreviewCounts.get(dayKey()) || 0;
  return {
    startedAt,
    uptimeMs: Date.now() - startedAt,
    previewTotal,
    previewToday: today,
    convertTotal,
    convertErrors,
    cacheHits,
    cacheMisses,
    cacheHitRate: attempts ? cacheHits / attempts : 0,
    avgConvertMs: convertDurationCount
      ? Math.round(convertDurationSum / convertDurationCount)
      : 0,
    lastErrorAt,
  };
}

async function dirStats(
  dir: string,
  filter?: (name: string) => boolean,
): Promise<{ count: number; bytes: number }> {
  try {
    const names = await fsp.readdir(dir);
    let count = 0;
    let bytes = 0;
    for (const name of names) {
      if (filter && !filter(name)) continue;
      if (name.startsWith(".")) continue;
      try {
        const st = await fsp.stat(path.join(dir, name));
        if (!st.isFile()) continue;
        count += 1;
        bytes += st.size;
      } catch {
        // ignore
      }
    }
    return { count, bytes };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

export async function getCacheInventory(): Promise<CacheInventory> {
  const convert = await dirStats(config.cacheDir);
  const remote = await dirStats(path.join(config.tempDir, "remote-cache"), (n) =>
    !n.endsWith(".part") && !n.endsWith(".meta.json"),
  );
  const temp = await dirStats(config.tempDir, (n) => !n.includes("remote-cache"));
  return {
    convert,
    remote,
    temp,
    totalBytes: convert.bytes + remote.bytes + temp.bytes,
  };
}

async function clearDirFiles(
  dir: string,
  filter?: (name: string) => boolean,
): Promise<{ removed: number; bytes: number }> {
  let removed = 0;
  let bytes = 0;
  try {
    const names = await fsp.readdir(dir);
    for (const name of names) {
      if (filter && !filter(name)) continue;
      const abs = path.join(dir, name);
      try {
        const st = await fsp.stat(abs);
        if (st.isDirectory()) {
          await fsp.rm(abs, { recursive: true, force: true });
          removed += 1;
        } else if (st.isFile()) {
          bytes += st.size;
          await fsp.unlink(abs);
          removed += 1;
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return { removed, bytes };
}

export async function clearCaches(scope: "convert" | "remote" | "temp" | "all"): Promise<{
  convert?: { removed: number; bytes: number };
  remote?: { removed: number; bytes: number };
  temp?: { removed: number; bytes: number };
}> {
  const result: {
    convert?: { removed: number; bytes: number };
    remote?: { removed: number; bytes: number };
    temp?: { removed: number; bytes: number };
  } = {};

  if (scope === "convert" || scope === "all") {
    result.convert = await clearDirFiles(config.cacheDir);
  }
  if (scope === "remote" || scope === "all") {
    result.remote = await clearDirFiles(path.join(config.tempDir, "remote-cache"));
  }
  if (scope === "temp" || scope === "all") {
    result.temp = await clearDirFiles(
      config.tempDir,
      (n) => n !== "remote-cache",
    );
  }

  recordMonitorEvent({
    kind: "cache-clear",
    level: "info",
    message: `已清理缓存 scope=${scope}`,
    detail: result as Record<string, unknown>,
  });

  return result;
}
