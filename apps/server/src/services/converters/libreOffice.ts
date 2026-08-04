import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { config } from "../../config.js";
import { ensureDir, safeJoin } from "../../utils/path.js";
import {
  cacheKey,
  cachePathFor,
  hasCache,
  removeCache,
  writeCacheFile,
} from "../cache.js";

export async function convertToPdf(opts: {
  sourcePath: string;
  sourceName: string;
  force?: boolean;
}): Promise<{ pdfPath: string; key: string }> {
  const stat = await fs.stat(opts.sourcePath);
  const key = cacheKey([
    opts.sourcePath,
    String(stat.mtimeMs),
    String(stat.size),
    opts.sourceName,
  ]);

  if (opts.force) {
    await removeCache(key, "pdf");
  }

  if (await hasCache(key, "pdf")) {
    return { pdfPath: cachePathFor(key, "pdf"), key };
  }

  const workDir = safeJoin(config.tempDir, `conv-${nanoid(8)}`);
  ensureDir(workDir);

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
    return { pdfPath, key };
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
