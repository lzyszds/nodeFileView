import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import {
  downloadRemoteCached,
  findCachedRemote,
} from "../services/remoteCache.js";
import { applySafeContentHeaders } from "../services/security/contentSafety.js";
import { publicRemoteError } from "../services/security/redact.js";
import { sendFileWithRange } from "../utils/sendFileRange.js";

export async function remoteRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: { url?: string; force?: string };
  }>(
    "/api/remote",
    {
      config: {
        rateLimit: {
          max: config.rateLimit.remoteMax,
          timeWindow: config.rateLimit.timeWindow,
        },
      },
    },
    async (request, reply) => {
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

        applySafeContentHeaders(reply, {
          filename: hit.filename,
          ext: hit.ext,
        });
        const maxAgeSec = Math.max(
          300,
          Math.floor(config.cache.remoteTtlMs / 1000) || 3600,
        );
        return sendFileWithRange(request, reply, hit.absPath, {
          cacheMaxAgeSec: maxAgeSec,
        });
      } catch (err) {
        request.log.warn({ err }, "remote fetch failed");
        return reply.code(400).send({ error: publicRemoteError(err) });
      }
    },
  );
}
