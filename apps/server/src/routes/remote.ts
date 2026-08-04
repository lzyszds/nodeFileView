import fsp from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import mime from "mime-types";
import {
  downloadRemoteCached,
  findCachedRemote,
  openCachedRemoteStream,
} from "../services/remoteCache.js";
import { getExt } from "../utils/ext.js";

export async function remoteRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: { url?: string; force?: string };
  }>("/api/remote", async (request, reply) => {
    const remoteUrl = request.query.url;
    if (!remoteUrl) {
      return reply.code(400).send({ error: "url is required" });
    }
    const force =
      request.query.force === "1" || request.query.force === "true";

    try {
      let hit = force ? null : await findCachedRemote(remoteUrl);
      if (!hit) {
        const downloaded = await downloadRemoteCached(remoteUrl, force);
        hit = {
          absPath: downloaded.absPath,
          filename: downloaded.filename,
          ext: downloaded.ext,
        };
      }

      const type =
        mime.lookup(hit.ext) ||
        mime.lookup(hit.filename) ||
        "application/octet-stream";
      const stat = await fsp.stat(hit.absPath);

      reply.header("Content-Type", type);
      reply.header("Content-Length", String(stat.size));
      reply.header(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(hit.filename)}"`,
      );
      reply.header("Cache-Control", "private, max-age=3600");
      reply.header("X-Content-Type-Options", "nosniff");
      return reply.send(openCachedRemoteStream(hit.absPath));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Remote fetch failed";
      return reply.code(400).send({ error: message });
    }
  });
}

export function guessRemoteExt(remoteUrl: string): string {
  try {
    const u = new URL(remoteUrl);
    return getExt(u.pathname) || getExt(path.basename(u.pathname));
  } catch {
    return "";
  }
}
