import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import AdmZip from "adm-zip";
import * as tar from "tar";
import { createExtractorFromData } from "node-unrar-js";
import { nanoid } from "nanoid";
import { config } from "../../config.js";
import { getExt } from "../../utils/ext.js";
import { ensureDir, safeJoin, sanitizeArchiveEntry } from "../../utils/path.js";

const require = createRequire(import.meta.url);

export interface ArchiveEntry {
  path: string;
  name: string;
  size: number;
  isDirectory: boolean;
}

function isZipFamily(ext: string): boolean {
  return ["zip", "jar", "war", "ear", "apk"].includes(ext);
}

function isTarFamily(ext: string): boolean {
  return ["tar", "gz", "tgz", "gzip"].includes(ext);
}

function path7za(): string {
  const mod = require("7zip-bin") as { path7za: string };
  const bin = mod.path7za;
  try {
    fs.accessSync(bin, fs.constants.X_OK);
  } catch {
    try {
      fs.chmodSync(bin, 0o755);
    } catch {
      // ignore; spawn will surface a clearer error
    }
  }
  return bin;
}

function run7za(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(path7za(), args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

export async function listArchive(
  archivePath: string,
  ext: string,
): Promise<ArchiveEntry[]> {
  const e = ext.toLowerCase();
  if (isZipFamily(e)) return listZip(archivePath);
  if (isTarFamily(e)) return listTar(archivePath, e);
  if (e === "rar") return listRar(archivePath);
  if (e === "7z") return list7z(archivePath);
  throw new Error(`Archive type .${ext} is not supported`);
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

async function listRar(archivePath: string): Promise<ArchiveEntry[]> {
  const buf = await fsp.readFile(archivePath);
  const extractor = await createExtractorFromData({
    data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  });
  const list = extractor.getFileList();
  const headers = [...list.fileHeaders];
  return headers
    .map((h) => {
      const p = String(h.name || "").replace(/\\/g, "/");
      const isDirectory = Boolean(h.flags?.directory) || p.endsWith("/");
      return {
        path: p,
        name: path.posix.basename(p.replace(/\/$/, "")),
        size: Number(h.unpSize || h.packSize || 0),
        isDirectory,
      };
    })
    .filter((e) => e.path && !e.path.includes(".."))
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function list7z(archivePath: string): Promise<ArchiveEntry[]> {
  // -slt: technical listing; easier to parse Path/Size/Folder fields
  const { stdout, stderr, code } = await run7za(["l", "-slt", "-ba", archivePath]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `7z list failed (code ${code})`);
  }

  const blocks = stdout.split(/\n(?=Path = )/g);
  const entries: ArchiveEntry[] = [];
  for (const block of blocks) {
    // Skip the archive container header block
    if (/^Physical Size = /m.test(block) || /^Type = 7z$/m.test(block)) {
      continue;
    }
    const pathMatch = /^Path = (.+)$/m.exec(block);
    if (!pathMatch) continue;
    const p = pathMatch[1].replace(/\\/g, "/").trim();
    if (!p || p.includes("..")) continue;
    const folderMatch = /^Folder = (\+|-)(?:\r)?$/m.exec(block);
    const sizeMatch = /^Size = (\d+)/m.exec(block);
    const isDirectory =
      folderMatch?.[1] === "+" ||
      p.endsWith("/") ||
      /Attributes = D/i.test(block);
    entries.push({
      path: p,
      name: path.posix.basename(p.replace(/\/$/, "")),
      size: Number(sizeMatch?.[1] || 0),
      isDirectory,
    });
  }
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
  if (isZipFamily(e)) {
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
    await fsp.writeFile(absPath, entry.getData());
    const stat = await fsp.stat(absPath);
    if (stat.size > config.maxArchiveEntryBytes) {
      await fsp.unlink(absPath).catch(() => undefined);
      throw new Error("Archive entry exceeds max size after extract");
    }
    return { absPath, filename, ext: getExt(filename) };
  }

  if (isTarFamily(e)) {
    const gzip = e === "gz" || e === "tgz" || e === "gzip";
    await tar.x({
      file: opts.archivePath,
      gzip,
      cwd: outDir,
      filter: (p) => sanitizeArchiveEntry(p) === safeEntry,
    });
    const absPath = safeJoin(outDir, ...safeEntry.split("/"));
    await fsp.access(absPath);
    const stat = await fsp.stat(absPath);
    if (stat.size > config.maxArchiveEntryBytes) {
      await fsp.unlink(absPath).catch(() => undefined);
      throw new Error("Archive entry exceeds max size after extract");
    }
    const filename = path.basename(absPath);
    return { absPath, filename, ext: getExt(filename) };
  }

  if (e === "rar") {
    return extractRarEntry(opts.archivePath, safeEntry, outDir);
  }

  if (e === "7z") {
    return extract7zEntry(opts.archivePath, safeEntry, outDir);
  }

  throw new Error(`Archive type .${opts.ext} is not supported`);
}

async function extractRarEntry(
  archivePath: string,
  safeEntry: string,
  outDir: string,
): Promise<{ absPath: string; filename: string; ext: string }> {
  const buf = await fsp.readFile(archivePath);
  const extractor = await createExtractorFromData({
    data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  });
  const extracted = extractor.extract({ files: [safeEntry] });
  const files = [...extracted.files];
  const hit = files.find(
    (f) =>
      String(f.fileHeader.name || "").replace(/\\/g, "/") === safeEntry &&
      !f.fileHeader.flags?.directory,
  );
  if (!hit?.extraction) {
    throw new Error("Archive entry not found");
  }
  if (hit.extraction.byteLength > config.maxArchiveEntryBytes) {
    throw new Error(
      `Archive entry exceeds max size (${Math.round(config.maxArchiveEntryBytes / 1024 / 1024)} MB)`,
    );
  }
  const filename = path.posix.basename(safeEntry);
  const absPath = safeJoin(outDir, filename);
  await fsp.writeFile(absPath, Buffer.from(hit.extraction));
  return { absPath, filename, ext: getExt(filename) };
}

async function extract7zEntry(
  archivePath: string,
  safeEntry: string,
  outDir: string,
): Promise<{ absPath: string; filename: string; ext: string }> {
  // Extract only the selected entry into outDir, preserving relative path
  const { stderr, code } = await run7za([
    "x",
    archivePath,
    `-o${outDir}`,
    safeEntry,
    "-y",
  ]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `7z extract failed (code ${code})`);
  }
  const absPath = safeJoin(outDir, ...safeEntry.split("/"));
  await fsp.access(absPath);
  const stat = await fsp.stat(absPath);
  if (stat.isDirectory()) {
    throw new Error("Archive entry not found");
  }
  if (stat.size > config.maxArchiveEntryBytes) {
    await fsp.unlink(absPath).catch(() => undefined);
    throw new Error("Archive entry exceeds max size after extract");
  }
  const filename = path.basename(absPath);
  return { absPath, filename, ext: getExt(filename) };
}
