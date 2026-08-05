import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import { getExt, isAudio, resolvePreviewKind } from "../utils/ext.js";
import { safeJoin } from "../utils/path.js";
import {
  renderArchiveViewer,
  renderErrorPage,
  renderUnsupported,
} from "../viewers/archive.js";
import { renderDocxViewer } from "../viewers/docx.js";
import { renderExcelViewer } from "../viewers/excel.js";
import { renderHtmlViewer } from "../viewers/html.js";
import { renderImageViewer } from "../viewers/image.js";
import { renderMarkdownViewer } from "../viewers/markdown.js";
import { renderMediaViewer } from "../viewers/media.js";
import { renderPdfViewer } from "../viewers/pdf.js";
import { renderPptxViewer } from "../viewers/pptx.js";
import { guessLanguage, renderTextViewer } from "../viewers/text.js";
import { extractArchiveEntry, listArchive } from "./archives/zipService.js";
import { cacheKey, cacheUrl, removeCache, writeCacheFile } from "./cache.js";
import { convertToPdf } from "./converters/libreOffice.js";
import { getFile, parseLocalFileUrl, ensureStoredFromDisk } from "./fileStore.js";
import {
  downloadRemoteCached,
  remoteCacheId,
  remoteProxyUrl,
} from "./remoteCache.js";
import { recordMonitorEvent } from "./monitor.js";

export interface PreviewQuery {
  url: string;
  watermarkTxt?: string;
  page?: number;
  highlight?: string;
  forceUpdatedCache?: boolean;
  archiveEntry?: string;
  password?: string;
}

export interface PreviewResult {
  status: number;
  html: string;
}

const TEXT_MAX = 512 * 1024;

/** 浏览器侧解析，预览 HTML 可秒开，文件走 /api/remote 或 /api/raw */
const BROWSER_PARSED = new Set([
  "xlsx",
  "xls",
  "csv",
  "tsv",
  "docx",
  "pptx",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "webp",
  "svg",
  "tif",
  "tiff",
  "heic",
  "mp3",
  "wav",
  "ogg",
  "mp4",
  "webm",
  "mov",
  "m4a",
  "flac",
]);

interface SourceFile {
  absPath: string;
  filename: string;
  ext: string;
  fileId?: string;
  archiveEntry?: string;
}

function extFromRemoteUrl(url: string): string {
  try {
    const u = new URL(url);
    return getExt(u.pathname) || getExt(decodeURIComponent(path.basename(u.pathname)));
  } catch {
    return "";
  }
}

function titleFromRemoteUrl(url: string): string {
  try {
    const u = new URL(url);
    const base = decodeURIComponent(path.basename(u.pathname));
    return base && base !== "/" ? base : "remote-file";
  } catch {
    return "remote-file";
  }
}

async function resolveSource(
  url: string,
  force?: boolean,
): Promise<SourceFile> {
  const localId = parseLocalFileUrl(url);
  if (localId) {
    const file = await getFile(localId);
    if (!file) throw new Error("Local file not found");
    return {
      absPath: file.path,
      filename: file.originalName,
      ext: file.ext,
      fileId: file.fileId,
    };
  }

  if (/^https?:\/\//i.test(url)) {
    const remote = await downloadRemoteCached(url, force);
    // 压缩包目录/条目预览依赖 fileId；把远程缓存登记进 uploads
    if (resolvePreviewKind(remote.ext) === "archive") {
      const stored = await ensureStoredFromDisk({
        absPath: remote.absPath,
        originalName: remote.filename,
        ext: remote.ext,
        stableId: `r${remoteCacheId(url).slice(0, 15)}`,
        force,
      });
      return {
        absPath: stored.path,
        filename: stored.originalName,
        ext: stored.ext,
        fileId: stored.fileId,
      };
    }
    return {
      absPath: remote.absPath,
      filename: remote.filename,
      ext: remote.ext,
    };
  }

  throw new Error(
    "Unsupported url scheme. Use http(s) or uploaded file://local/{id}",
  );
}

async function materializeTempUrl(source: SourceFile): Promise<string> {
  const abs = path.resolve(source.absPath);
  const tempRoot = path.resolve(config.tempDir);
  if (abs === tempRoot || abs.startsWith(tempRoot + path.sep)) {
    const rel = path.relative(tempRoot, abs).replace(/\\/g, "/");
    // remote-cache/xxx.xlsx → serve via dedicated query? use copy for simple temp route
    if (!rel.includes("..") && /^[\w./-]+$/.test(rel) && !rel.includes("remote-cache/")) {
      return `/api/temp/${path.basename(abs)}`;
    }
  }
  const id = nanoid(12);
  const ext = source.ext || "bin";
  const fileName = `serve-${id}.${ext}`;
  const dest = safeJoin(config.tempDir, fileName);
  await fs.copyFile(source.absPath, dest);
  return `/api/temp/${fileName}`;
}

function rawUrlFor(source: SourceFile): string {
  if (source.fileId && source.archiveEntry) {
    return `/api/archive/${source.fileId}/entry?path=${encodeURIComponent(source.archiveEntry)}`;
  }
  if (source.fileId) {
    return `/api/raw/${source.fileId}`;
  }
  return "";
}

async function ensurePdfUrl(
  source: SourceFile,
  force?: boolean,
): Promise<string> {
  if (source.ext === "pdf") {
    const direct = rawUrlFor(source);
    if (direct) return direct;
    const stat = await fs.stat(source.absPath);
    const key = cacheKey([
      source.absPath,
      String(stat.mtimeMs),
      String(stat.size),
      "pdf",
    ]);
    if (force) await removeCache(key, "pdf");
    await writeCacheFile(key, source.absPath, "pdf");
    return cacheUrl(key, "pdf");
  }

  const converted = await convertToPdf({
    sourcePath: source.absPath,
    sourceName: source.filename,
    force,
  });
  return cacheUrl(converted.key, "pdf");
}

export async function buildPreview(query: PreviewQuery): Promise<PreviewResult> {
  const started = Date.now();
  const finish = (
    result: PreviewResult,
    meta: { title?: string; ext?: string; mode?: string },
  ): PreviewResult => {
    const ok = result.status < 400;
    recordMonitorEvent({
      kind: ok ? "preview" : "error",
      level: ok ? "info" : "error",
      message: ok
        ? `预览成功：${meta.title || "file"}`
        : `预览失败：${meta.title || meta.mode || "file"}`,
      detail: {
        status: result.status,
        ext: meta.ext,
        mode: meta.mode,
        force: Boolean(query.forceUpdatedCache),
      },
      durationMs: Date.now() - started,
    });
    return result;
  };

  try {
    const force = Boolean(query.forceUpdatedCache);
    const watermark = query.watermarkTxt;

    // 浏览器可直接解析的远程文件：先返回预览页，文件走 /api/remote（带磁盘缓存）
    if (/^https?:\/\//i.test(query.url) && !query.archiveEntry) {
      const remoteExt = extFromRemoteUrl(query.url);
      if (remoteExt && BROWSER_PARSED.has(remoteExt)) {
        const title = titleFromRemoteUrl(query.url);
        const fileUrl = remoteProxyUrl(query.url, force);
        const remoteMeta = { title, ext: remoteExt, mode: "remote-browser" };
        if (["xlsx", "xls", "csv", "tsv"].includes(remoteExt)) {
          return finish(
            {
              status: 200,
              html: renderExcelViewer({
                title,
                fileUrl,
                watermark,
                highlight: query.highlight,
              }),
            },
            remoteMeta,
          );
        }
        if (remoteExt === "docx") {
          return finish(
            {
              status: 200,
              html: renderDocxViewer({
                title,
                fileUrl,
                watermark,
                highlight: query.highlight,
              }),
            },
            remoteMeta,
          );
        }
        if (remoteExt === "pptx") {
          return finish(
            {
              status: 200,
              html: renderPptxViewer({ title, fileUrl, watermark }),
            },
            remoteMeta,
          );
        }
        if (resolvePreviewKind(remoteExt) === "image") {
          return finish(
            {
              status: 200,
              html: renderImageViewer({
                title,
                imageUrl: fileUrl,
                watermark,
                ext: remoteExt,
              }),
            },
            remoteMeta,
          );
        }
        if (resolvePreviewKind(remoteExt) === "media") {
          return finish(
            {
              status: 200,
              html: renderMediaViewer({
                title,
                mediaUrl: fileUrl,
                audio: isAudio(remoteExt),
                watermark,
              }),
            },
            remoteMeta,
          );
        }
      }
    }

    let source = await resolveSource(query.url, force);
    const parentFileId = source.fileId;

    if (query.archiveEntry) {
      if (!parentFileId) {
        return finish(
          {
            status: 400,
            html: renderErrorPage(
              "Archive entry preview requires an uploaded archive",
            ),
          },
          { mode: "archive-entry" },
        );
      }
      const extracted = await extractArchiveEntry({
        archivePath: source.absPath,
        ext: source.ext,
        entryPath: query.archiveEntry,
      });
      source = {
        absPath: extracted.absPath,
        filename: extracted.filename,
        ext: extracted.ext,
        fileId: parentFileId,
        archiveEntry: query.archiveEntry,
      };
    }

    const kind = resolvePreviewKind(source.ext);
    const title = source.filename;
    const localMeta = { title, ext: source.ext, mode: kind };

    if (kind === "archive" && !query.archiveEntry) {
      if (!source.fileId) {
        return finish(
          {
            status: 400,
            html: renderErrorPage(
              "Please upload the archive first to browse its contents",
            ),
          },
          localMeta,
        );
      }
      const entries = await listArchive(source.absPath, source.ext);
      return finish(
        {
          status: 200,
          html: renderArchiveViewer({
            title,
            fileId: source.fileId,
            entries,
            watermark,
          }),
        },
        localMeta,
      );
    }

    if (source.ext === "docx") {
      const fileUrl = rawUrlFor(source) || (await materializeTempUrl(source));
      return finish(
        {
          status: 200,
          html: renderDocxViewer({
            title,
            fileUrl,
            watermark,
            highlight: query.highlight,
          }),
        },
        localMeta,
      );
    }

    if (["xlsx", "xls", "csv", "tsv"].includes(source.ext)) {
      const fileUrl = rawUrlFor(source) || (await materializeTempUrl(source));
      return finish(
        {
          status: 200,
          html: renderExcelViewer({
            title,
            fileUrl,
            watermark,
            highlight: query.highlight,
          }),
        },
        localMeta,
      );
    }

    if (source.ext === "pptx") {
      const fileUrl = rawUrlFor(source) || (await materializeTempUrl(source));
      return finish(
        {
          status: 200,
          html: renderPptxViewer({
            title,
            fileUrl,
            watermark,
          }),
        },
        localMeta,
      );
    }

    if (kind === "pdf" || kind === "office") {
      const pdfUrl = await ensurePdfUrl(source, force);
      const presentation = ["ppt", "dps", "odp"].includes(source.ext);
      return finish(
        {
          status: 200,
          html: renderPdfViewer({
            title,
            pdfUrl,
            page: query.page,
            highlight: query.highlight,
            watermark,
            presentation,
          }),
        },
        localMeta,
      );
    }

    if (kind === "image") {
      const imageUrl = rawUrlFor(source) || (await materializeTempUrl(source));
      return finish(
        {
          status: 200,
          html: renderImageViewer({
            title,
            imageUrl,
            watermark,
            ext: source.ext,
          }),
        },
        localMeta,
      );
    }

    if (kind === "text") {
      const buf = await fs.readFile(source.absPath);
      const truncated = buf.length > TEXT_MAX;
      const content = buf.subarray(0, TEXT_MAX).toString("utf8");
      if (source.ext === "md" || source.ext === "markdown") {
        return finish(
          {
            status: 200,
            html: renderMarkdownViewer({
              title,
              content,
              watermark,
              truncated,
            }),
          },
          localMeta,
        );
      }
      if (source.ext === "html" || source.ext === "htm") {
        let baseHref = "";
        if (/^https?:\/\//i.test(query.url)) {
          try {
            const u = new URL(query.url);
            u.hash = "";
            const pathName = u.pathname.endsWith("/")
              ? u.pathname
              : u.pathname.replace(/[^/]+$/, "");
            u.pathname = pathName || "/";
            u.search = "";
            baseHref = u.toString();
          } catch {
            baseHref = "";
          }
        } else {
          const raw = rawUrlFor(source);
          if (raw) baseHref = raw;
        }
        return finish(
          {
            status: 200,
            html: renderHtmlViewer({
              title,
              content,
              baseHref,
              watermark,
              truncated,
            }),
          },
          localMeta,
        );
      }
      return finish(
        {
          status: 200,
          html: await renderTextViewer({
            title,
            content,
            language: guessLanguage(source.ext),
            watermark,
            truncated,
          }),
        },
        localMeta,
      );
    }

    if (kind === "media") {
      const mediaUrl = rawUrlFor(source) || (await materializeTempUrl(source));
      return finish(
        {
          status: 200,
          html: renderMediaViewer({
            title,
            mediaUrl,
            audio: isAudio(source.ext),
            watermark,
          }),
        },
        localMeta,
      );
    }

    return finish(
      {
        status: 415,
        html: renderUnsupported({ title, ext: source.ext || getExt(title) }),
      },
      localMeta,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preview failed";
    return finish(
      { status: 400, html: renderErrorPage(message, 400) },
      { title: message.slice(0, 80), mode: "exception" },
    );
  }
}
