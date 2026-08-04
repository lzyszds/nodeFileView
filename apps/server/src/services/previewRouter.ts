import fs from "node:fs/promises";
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
import { renderImageViewer } from "../viewers/image.js";
import { renderMediaViewer } from "../viewers/media.js";
import { renderPdfViewer } from "../viewers/pdf.js";
import { guessLanguage, renderTextViewer } from "../viewers/text.js";
import { extractArchiveEntry, listArchive } from "./archives/zipService.js";
import { cacheKey, cacheUrl, removeCache, writeCacheFile } from "./cache.js";
import { convertToPdf } from "./converters/libreOffice.js";
import {
  downloadRemoteToTemp,
  getFile,
  parseLocalFileUrl,
} from "./fileStore.js";

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

interface SourceFile {
  absPath: string;
  filename: string;
  ext: string;
  fileId?: string;
  archiveEntry?: string;
}

async function resolveSource(url: string): Promise<SourceFile> {
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
    const remote = await downloadRemoteToTemp(url);
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
  try {
    let source = await resolveSource(query.url);
    const parentFileId = source.fileId;

    if (query.archiveEntry) {
      if (!parentFileId) {
        return {
          status: 400,
          html: renderErrorPage(
            "Archive entry preview requires an uploaded archive",
          ),
        };
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
    const watermark = query.watermarkTxt;
    const title = source.filename;

    if (kind === "archive" && !query.archiveEntry) {
      if (!source.fileId) {
        return {
          status: 400,
          html: renderErrorPage(
            "Please upload the archive first to browse its contents",
          ),
        };
      }
      const entries = await listArchive(source.absPath, source.ext);
      return {
        status: 200,
        html: renderArchiveViewer({
          title,
          fileId: source.fileId,
          entries,
          watermark,
        }),
      };
    }

    if (source.ext === "docx") {
      const fileUrl = rawUrlFor(source) || (await materializeTempUrl(source));
      return {
        status: 200,
        html: renderDocxViewer({
          title,
          fileUrl,
          watermark,
          highlight: query.highlight,
        }),
      };
    }

    if (kind === "pdf" || kind === "office") {
      const pdfUrl = await ensurePdfUrl(source, query.forceUpdatedCache);
      return {
        status: 200,
        html: renderPdfViewer({
          title,
          pdfUrl,
          page: query.page,
          highlight: query.highlight,
          watermark,
        }),
      };
    }

    if (kind === "image") {
      const imageUrl = rawUrlFor(source) || (await materializeTempUrl(source));
      return {
        status: 200,
        html: renderImageViewer({ title, imageUrl, watermark }),
      };
    }

    if (kind === "text") {
      const buf = await fs.readFile(source.absPath);
      const truncated = buf.length > TEXT_MAX;
      const content = buf.subarray(0, TEXT_MAX).toString("utf8");
      return {
        status: 200,
        html: renderTextViewer({
          title,
          content,
          language: guessLanguage(source.ext),
          watermark,
          truncated,
        }),
      };
    }

    if (kind === "media") {
      const mediaUrl = rawUrlFor(source) || (await materializeTempUrl(source));
      return {
        status: 200,
        html: renderMediaViewer({
          title,
          mediaUrl,
          audio: isAudio(source.ext),
          watermark,
        }),
      };
    }

    return {
      status: 415,
      html: renderUnsupported({ title, ext: source.ext || getExt(title) }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preview failed";
    return { status: 400, html: renderErrorPage(message, 400) };
  }
}
