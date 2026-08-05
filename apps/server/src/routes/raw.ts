import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { extractArchiveEntry, listArchive } from "../services/archives/zipService.js";
import { getFile } from "../services/fileStore.js";
import { applySafeContentHeaders } from "../services/security/contentSafety.js";
import { PathEscapeError, safeJoin } from "../utils/path.js";

export async function rawRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { fileId: string } }>(
    "/api/raw/:fileId",
    async (request, reply) => {
      const file = await getFile(request.params.fileId);
      if (!file) return reply.code(404).send({ error: "Not found" });
      // 不信任上传时客户端声明的 mime，按扩展名安全输出
      applySafeContentHeaders(reply, {
        filename: file.name,
        ext: file.ext,
      });
      reply.header("Cache-Control", "private, max-age=120");
      return reply.send(fs.createReadStream(file.path));
    },
  );

  app.get<{ Params: { name: string } }>(
    "/api/cache/:name",
    async (request, reply) => {
      try {
        const name = path.basename(request.params.name);
        if (!/^[\w.-]+$/.test(name)) {
          return reply.code(400).send({ error: "Invalid cache name" });
        }
        const abs = safeJoin(config.cacheDir, name);
        await fsp.access(abs);
        applySafeContentHeaders(reply, { filename: name });
        return reply.send(fs.createReadStream(abs));
      } catch (err) {
        if (err instanceof PathEscapeError) {
          return reply.code(400).send({ error: "Invalid path" });
        }
        return reply.code(404).send({ error: "Not found" });
      }
    },
  );

  app.get<{ Params: { name: string } }>(
    "/api/temp/:name",
    async (request, reply) => {
      try {
        const name = path.basename(request.params.name);
        if (!/^(serve-)?[\w.-]+$/.test(name)) {
          return reply.code(400).send({ error: "Invalid temp name" });
        }
        const abs = safeJoin(config.tempDir, name);
        await fsp.access(abs);
        applySafeContentHeaders(reply, { filename: name });
        reply.header("Cache-Control", "private, max-age=300");
        return reply.send(fs.createReadStream(abs));
      } catch (err) {
        if (err instanceof PathEscapeError) {
          return reply.code(400).send({ error: "Invalid path" });
        }
        return reply.code(404).send({ error: "Not found" });
      }
    },
  );

  app.get<{ Params: { fileId: string } }>(
    "/api/archive/:fileId/list",
    async (request, reply) => {
      const file = await getFile(request.params.fileId);
      if (!file) return reply.code(404).send({ error: "Not found" });
      try {
        const entries = await listArchive(file.path, file.ext);
        return { fileId: file.fileId, entries };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to list archive";
        return reply.code(400).send({ error: message });
      }
    },
  );

  app.get<{
    Params: { fileId: string };
    Querystring: { path?: string };
  }>("/api/archive/:fileId/entry", async (request, reply) => {
    const file = await getFile(request.params.fileId);
    if (!file) return reply.code(404).send({ error: "Not found" });
    const entryPath = request.query.path;
    if (!entryPath) return reply.code(400).send({ error: "path is required" });
    try {
      const extracted = await extractArchiveEntry({
        archivePath: file.path,
        ext: file.ext,
        entryPath,
      });
      applySafeContentHeaders(reply, {
        filename: extracted.filename,
        ext: extracted.ext,
      });
      return reply.send(fs.createReadStream(extracted.absPath));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Extract failed";
      return reply.code(400).send({ error: message });
    }
  });
}
