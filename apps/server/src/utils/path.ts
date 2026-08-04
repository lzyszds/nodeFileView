import fs from "node:fs";
import path from "node:path";

export class PathEscapeError extends Error {
  constructor(message = "Path escapes allowed root") {
    super(message);
    this.name = "PathEscapeError";
  }
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function assertInsideRoot(root: string, target: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const rel = path.relative(resolvedRoot, resolvedTarget);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new PathEscapeError();
  }
  return resolvedTarget;
}

export function safeJoin(root: string, ...parts: string[]): string {
  const joined = path.join(root, ...parts);
  return assertInsideRoot(root, joined);
}

export function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[\0\r\n]/g, "");
  return base.replace(/[<>:"|?*\\/]/g, "_").slice(0, 200) || "unnamed";
}

export function sanitizeArchiveEntry(entryPath: string): string {
  const normalized = entryPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new PathEscapeError("Invalid archive entry path");
  }
  return normalized;
}
