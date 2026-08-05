import type { FastifyReply } from "fastify";
import mime from "mime-types";
import { getExt } from "../../utils/ext.js";

/** 可在浏览器同源执行脚本的类型：强制 attachment，避免挂马页 */
const ACTIVE_DOCUMENT_EXTS = new Set([
  "html",
  "htm",
  "xhtml",
  "js",
  "mjs",
  "cjs",
  "xml",
  "xsl",
  "xslt",
]);

const SVG_EXTS = new Set(["svg", "svgz"]);

export function isActiveDocumentExt(ext: string): boolean {
  return ACTIVE_DOCUMENT_EXTS.has(ext.toLowerCase());
}

export function isSvgExt(ext: string): boolean {
  return SVG_EXTS.has(ext.toLowerCase());
}

/**
 * 为 /api/raw|/api/remote|/api/archive/entry 设置安全响应头。
 * - HTML/JS/XML：octet-stream + attachment（禁止浏览器当页面执行）
 * - SVG：保留 image/svg+xml 供 <img> 预览，但禁脚本 CSP
 * - 其它：按扩展名 MIME + inline
 */
export function applySafeContentHeaders(
  reply: FastifyReply,
  opts: {
    filename: string;
    ext?: string;
    preferredMime?: string | false;
  },
): void {
  const filename = opts.filename || "file";
  const ext = (opts.ext || getExt(filename)).toLowerCase();
  const encoded = encodeURIComponent(filename);

  reply.header("X-Content-Type-Options", "nosniff");

  if (isActiveDocumentExt(ext)) {
    reply.header("Content-Type", "application/octet-stream");
    reply.header(
      "Content-Disposition",
      `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
    );
    reply.header("Content-Security-Policy", "default-src 'none'; sandbox");
    return;
  }

  if (isSvgExt(ext)) {
    reply.header("Content-Type", "image/svg+xml");
    reply.header(
      "Content-Disposition",
      `inline; filename="${encoded}"; filename*=UTF-8''${encoded}`,
    );
    reply.header(
      "Content-Security-Policy",
      "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'none'; sandbox",
    );
    return;
  }

  const type =
    (opts.preferredMime === false
      ? null
      : opts.preferredMime) ||
    mime.lookup(ext) ||
    mime.lookup(filename) ||
    "application/octet-stream";
  reply.header("Content-Type", String(type));
  reply.header(
    "Content-Disposition",
    `inline; filename="${encoded}"; filename*=UTF-8''${encoded}`,
  );
}
