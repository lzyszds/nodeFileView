import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { config } from "../../config.js";
import { ensureDir, safeJoin } from "../../utils/path.js";
import { Semaphore } from "../../utils/semaphore.js";
import {
  cacheKey,
  cachePathFor,
  hasCache,
  removeCache,
  writeCacheFile,
} from "../cache.js";
import { recordMonitorEvent } from "../monitor.js";

const convertSem = new Semaphore(config.convertMaxConcurrent || 2);
const inflightConverts = new Map<
  string,
  Promise<{ pdfPath: string; key: string; cacheHit: boolean }>
>();

export async function convertToPdf(opts: {
  sourcePath: string;
  sourceName: string;
  force?: boolean;
}): Promise<{ pdfPath: string; key: string; cacheHit: boolean }> {
  const stat = await fs.stat(opts.sourcePath);
  const key = cacheKey([
    opts.sourcePath,
    String(stat.mtimeMs),
    String(stat.size),
    opts.sourceName,
  ]);

  if (opts.force) {
    await removeCache(key, "pdf");
  } else if (await hasCache(key, "pdf")) {
    recordMonitorEvent({
      kind: "convert",
      level: "info",
      message: `转换缓存命中：${opts.sourceName}`,
      detail: { sourceName: opts.sourceName, key: key.slice(0, 12) },
      durationMs: 0,
      cacheHit: true,
    });
    return { pdfPath: cachePathFor(key, "pdf"), key, cacheHit: true };
  }

  const lockKey = opts.force ? `force:${key}` : key;
  const existing = inflightConverts.get(lockKey);
  if (existing) return existing;

  const job = convertSem
    .run(() => convertToPdfWorker(opts, key))
    .finally(() => {
      if (inflightConverts.get(lockKey) === job) {
        inflightConverts.delete(lockKey);
      }
    });
  inflightConverts.set(lockKey, job);
  return job;
}

async function convertToPdfWorker(
  opts: { sourcePath: string; sourceName: string; force?: boolean },
  key: string,
): Promise<{ pdfPath: string; key: string; cacheHit: boolean }> {
  if (!opts.force && (await hasCache(key, "pdf"))) {
    recordMonitorEvent({
      kind: "convert",
      level: "info",
      message: `转换缓存命中：${opts.sourceName}`,
      detail: { sourceName: opts.sourceName, key: key.slice(0, 12), coalesced: true },
      durationMs: 0,
      cacheHit: true,
    });
    return { pdfPath: cachePathFor(key, "pdf"), key, cacheHit: true };
  }

  const workDir = safeJoin(config.tempDir, `conv-${nanoid(8)}`);
  ensureDir(workDir);
  const started = Date.now();

  try {
    const outDir = workDir;
    await runSoffice(opts.sourcePath, outDir);

    const files = await fs.readdir(outDir);
    const pdfName = files.find((f) => f.toLowerCase().endsWith(".pdf"));
    if (!pdfName) {
      throw new Error("LibreOffice conversion produced no PDF");
    }
    const produced = path.join(outDir, pdfName);
    const pdfPath = await writeCacheFile(key, produced, "pdf");
    const durationMs = Date.now() - started;
    recordMonitorEvent({
      kind: "convert",
      level: "info",
      message: `转码完成：${opts.sourceName}`,
      detail: {
        sourceName: opts.sourceName,
        key: key.slice(0, 12),
        force: Boolean(opts.force),
        queuePending: convertSem.pending,
      },
      durationMs,
      cacheHit: false,
    });
    return { pdfPath, key, cacheHit: false };
  } catch (err) {
    recordMonitorEvent({
      kind: "convert",
      level: "error",
      message: `转码失败：${opts.sourceName}`,
      detail: {
        sourceName: opts.sourceName,
        error: err instanceof Error ? err.message : String(err),
      },
      durationMs: Date.now() - started,
      cacheHit: false,
    });
    throw err;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runSoffice(sourcePath: string, outDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "--headless",
      "--nologo",
      "--nolockcheck",
      "--nodefault",
      "--norestore",
      "--convert-to",
      "pdf",
      "--outdir",
      outDir,
      sourcePath,
    ];

    const child = spawn(config.libreOfficePath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("LibreOffice conversion timed out"));
    }, config.convertTimeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Failed to start LibreOffice (${config.libreOfficePath}): ${err.message}`,
        ),
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`LibreOffice failed (code ${code}): ${stderr}`));
    });
  });
}
