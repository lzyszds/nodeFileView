import fs from "node:fs";
import fsp from "node:fs/promises";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Stream a local file with HTTP Range support (needed for fast native PDF viewers).
 */
export async function sendFileWithRange(
  request: FastifyRequest,
  reply: FastifyReply,
  absPath: string,
): Promise<unknown> {
  const st = await fsp.stat(absPath);
  const size = st.size;
  reply.header("Accept-Ranges", "bytes");

  const rangeHeader = request.headers.range;
  if (!rangeHeader || typeof rangeHeader !== "string") {
    reply.header("Content-Length", size);
    return reply.send(fs.createReadStream(absPath));
  }

  const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!m) {
    reply.header("Content-Length", size);
    return reply.send(fs.createReadStream(absPath));
  }

  let start = m[1] ? Number(m[1]) : NaN;
  let end = m[2] ? Number(m[2]) : NaN;
  if (Number.isNaN(start) && Number.isNaN(end)) {
    reply.header("Content-Length", size);
    return reply.send(fs.createReadStream(absPath));
  }
  if (Number.isNaN(start)) {
    // suffix: bytes=-N
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
  return reply.send(fs.createReadStream(absPath, { start, end }));
}
