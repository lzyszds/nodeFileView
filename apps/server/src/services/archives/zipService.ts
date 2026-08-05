import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import * as tar from "tar";
import { nanoid } from "nanoid";
import { config } from "../../config.js";
import { getExt } from "../../utils/ext.js";
import { ensureDir, safeJoin, sanitizeArchiveEntry } from "../../utils/path.js";

export interface ArchiveEntry {
  path: string;
  name: string;
  size: number;
  isDirectory: boolean;
}

export async function listArchive(
  archivePath: string,
  ext: string,
): Promise<ArchiveEntry[]> {
  const e = ext.toLowerCase();
  if (e === "zip" || e === "jar") {
    return listZip(archivePath);
  }
  if (e === "tar" || e === "gz" || e === "tgz" || e === "gzip") {
    return listTar(archivePath, e);
  }
  throw new Error(`Archive type .${ext} is not supported in phase 1`);
}

function listZip(archivePath: string): ArchiveEntry[] {
  const zip = new AdmZip(archivePath);
  return zip
    .getEntries()
    .map((entry) => {
      const p = entry.entryName.replace(/\\/g, "/");
      return {
        path: p,
        name: path.posix.basename(p.replace(/\/$/, "")),
        size: entry.header.size,
        isDirectory: entry.isDirectory,
      };
    })
    .filter((e) => e.path && !e.path.includes(".."))
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function listTar(
  archivePath: string,
  ext: string,
): Promise<ArchiveEntry[]> {
  const entries: ArchiveEntry[] = [];
  const gzip = ext === "gz" || ext === "tgz" || ext === "gzip";
  await tar.list({
    file: archivePath,
    gzip,
    onentry: (entry) => {
      const p = entry.path.replace(/\\/g, "/");
      if (p.includes("..")) return;
      entries.push({
        path: p,
        name: path.posix.basename(p.replace(/\/$/, "")),
        size: Number(entry.size || 0),
        isDirectory: entry.type === "Directory",
      });
    },
  });
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export async function extractArchiveEntry(opts: {
  archivePath: string;
  ext: string;
  entryPath: string;
}): Promise<{ absPath: string; filename: string; ext: string }> {
  const safeEntry = sanitizeArchiveEntry(opts.entryPath);
  const outDir = safeJoin(config.tempDir, `arc-${nanoid(8)}`);
  ensureDir(outDir);

  const e = opts.ext.toLowerCase();
  if (e === "zip" || e === "jar") {
    const zip = new AdmZip(opts.archivePath);
    const entry = zip.getEntry(safeEntry);
    if (!entry || entry.isDirectory) {
      throw new Error("Archive entry not found");
    }
    const uncompressed = Number(entry.header?.size || 0);
    if (uncompressed > config.maxArchiveEntryBytes) {
      throw new Error(
        `Archive entry exceeds max size (${Math.round(config.maxArchiveEntryBytes / 1024 / 1024)} MB)`,
      );
    }
    const filename = path.posix.basename(safeEntry);
    const absPath = safeJoin(outDir, filename);
    await fs.writeFile(absPath, entry.getData());
    const stat = await fs.stat(absPath);
    if (stat.size > config.maxArchiveEntryBytes) {
      await fs.unlink(absPath).catch(() => undefined);
      throw new Error("Archive entry exceeds max size after extract");
    }
    return { absPath, filename, ext: getExt(filename) };
  }

  if (e === "tar" || e === "gz" || e === "tgz" || e === "gzip") {
    const gzip = e === "gz" || e === "tgz" || e === "gzip";
    await tar.x({
      file: opts.archivePath,
      gzip,
      cwd: outDir,
      filter: (p) => sanitizeArchiveEntry(p) === safeEntry,
    });
    const absPath = safeJoin(outDir, ...safeEntry.split("/"));
    await fs.access(absPath);
    const stat = await fs.stat(absPath);
    if (stat.size > config.maxArchiveEntryBytes) {
      await fs.unlink(absPath).catch(() => undefined);
      throw new Error("Archive entry exceeds max size after extract");
    }
    const filename = path.basename(absPath);
    return { absPath, filename, ext: getExt(filename) };
  }

  throw new Error(`Archive type .${opts.ext} is not supported`);
}
