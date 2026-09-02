import fs from "node:fs";
import fsp from "node:fs/promises";
import type { FastifyReply, FastifyRequest } from "fastify";

export interface SendFileOptions {
  /** Cache-Control max-age（秒）；0 或不传则不设 */
  cacheMaxAgeSec?: number;
  immutable?: boolean;
}

function buildEtag(mtimeMs: number, size: number): string {
  return `"${mtimeMs.toString(36)}-${size.toString(36)}"`;
}

/**
 * Stream a local file with HTTP Range + ETag/304 support.
 */
export async function sendFileWithRange(
  request: FastifyRequest,
  reply: FastifyReply,
  absPath: string,
  opts?: SendFileOptions,
): Promise<unknown> {
  const st = await fsp.stat(absPath);
  const size = st.size;
  const etag = buildEtag(st.mtimeMs, size);

  reply.header("Accept-Ranges", "bytes");
  reply.header("Last-Modified", new Date(st.mtimeMs).toUTCString());
  reply.header("ETag", etag);

  if (opts?.cacheMaxAgeSec && opts.cacheMaxAgeSec > 0) {
    const vis = opts.immutable ? "private, immutable" : "private";
    reply.header("Cache-Control", `${vis}, max-age=${opts.cacheMaxAgeSec}`);
  }

  const inm = request.headers["if-none-match"];
  if (inm === etag) {
    return reply.code(304).send();
  }

  const rangeHeader = request.headers.range;
  const streamOpts = { highWaterMark: 256 * 1024 };

  if (!rangeHeader || typeof rangeHeader !== "string") {
    reply.header("Content-Length", size);
    return reply.send(fs.createReadStream(absPath, streamOpts));
  }

  const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!m) {
    reply.header("Content-Length", size);
    return reply.send(fs.createReadStream(absPath, streamOpts));
  }

  let start = m[1] ? Number(m[1]) : NaN;
  let end = m[2] ? Number(m[2]) : NaN;
  if (Number.isNaN(start) && Number.isNaN(end)) {
    reply.header("Content-Length", size);
    return reply.send(fs.createReadStream(absPath, streamOpts));
  }
  if (Number.isNaN(start)) {
    const suffix = end;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else if (Number.isNaN(end)) {
    end = size - 1;
  }
  if (start < 0 || end < start || start >= size) {
    reply.code(416);
    reply.header("Content-Range", `bytes */${size}`);
    return reply.send();
  }
  end = Math.min(end, size - 1);
  const chunkSize = end - start + 1;
  reply.code(206);
  reply.header("Content-Range", `bytes ${start}-${end}/${size}`);
  reply.header("Content-Length", chunkSize);
  return reply.send(fs.createReadStream(absPath, { ...streamOpts, start, end }));
}
