import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import {
  deleteFile,
  listFiles,
  localFileUrl,
  saveUploadedFile,
} from "../services/fileStore.js";

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/upload", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "No file uploaded" });
    }

    const buffer = await file.toBuffer();
    if (buffer.length > config.maxUploadSizeBytes) {
      return reply.code(413).send({ error: "File too large" });
    }

    try {
      const stored = await saveUploadedFile({
        filename: file.filename,
        mimetype: file.mimetype,
        buffer,
      });
      return {
        fileId: stored.fileId,
        name: stored.originalName,
        size: stored.size,
        ext: stored.ext,
        mime: stored.mime,
        createdAt: stored.createdAt,
        previewUrl: `/onlinePreview?url=${encodeURIComponent(Buffer.from(localFileUrl(stored.fileId)).toString("base64"))}`,
        localUrl: localFileUrl(stored.fileId),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      return reply.code(400).send({ error: message });
    }
  });

  app.get<{
    Querystring: { page?: string; size?: string; q?: string };
  }>("/api/files", async (request) => {
    const page = Math.max(1, Number(request.query.page || 1));
    const size = Math.min(100, Math.max(1, Number(request.query.size || 20)));
    const result = await listFiles({ page, size, q: request.query.q });
    return {
      ...result,
      items: result.items.map((f) => ({
        fileId: f.fileId,
        name: f.originalName,
        size: f.size,
        ext: f.ext,
        mime: f.mime,
        createdAt: f.createdAt,
        previewUrl: `/onlinePreview?url=${encodeURIComponent(Buffer.from(localFileUrl(f.fileId)).toString("base64"))}`,
      })),
    };
  });

  app.delete<{ Params: { fileId: string } }>(
    "/api/files/:fileId",
    async (request, reply) => {
      const ok = await deleteFile(request.params.fileId);
      if (!ok) return reply.code(404).send({ error: "Not found" });
      return { ok: true };
    },
  );
}
