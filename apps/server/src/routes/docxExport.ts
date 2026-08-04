import type { FastifyInstance } from "fastify";
import HTMLtoDOCX from "html-to-docx";
import { sanitizeFilename } from "../utils/path.js";

export async function docxExportRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: {
      html?: string;
      title?: string;
      fileName?: string;
    };
  }>("/api/docx/export", async (request, reply) => {
    const html = request.body?.html;
    if (!html || typeof html !== "string") {
      return reply.code(400).send({ error: "html is required" });
    }
    if (html.length > 8 * 1024 * 1024) {
      return reply.code(413).send({ error: "HTML too large" });
    }

    const title = (request.body.title || "document").slice(0, 200);
    const rawName = request.body.fileName || `${title}.docx`;
    const fileName = sanitizeFilename(
      rawName.toLowerCase().endsWith(".docx") ? rawName : `${rawName}.docx`,
    );

    const wrapped = `<!DOCTYPE html><html><head><meta charset="UTF-8" /><title>${escapeXml(title)}</title></head><body>${html}</body></html>`;

    try {
      const result = await HTMLtoDOCX(wrapped, null, {
        table: { row: { cantSplit: true } },
        footer: true,
        pageNumber: true,
        font: "Microsoft YaHei",
        lang: "zh-CN",
      });
      const buffer = Buffer.isBuffer(result)
        ? result
        : Buffer.from(result as ArrayBuffer);

      reply
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        .header(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        )
        .send(buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed";
      return reply.code(500).send({ error: message });
    }
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
