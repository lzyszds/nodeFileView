import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { tryDecodeUrlParam } from "../services/security/aes.js";
import { buildPreview } from "../services/previewRouter.js";
import { renderErrorPage } from "../viewers/archive.js";
import { renderPasswordGate } from "../viewers/password.js";

export async function previewRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      url?: string;
      watermarkTxt?: string;
      page?: string;
      highlight?: string;
      forceUpdatedCache?: string;
      archiveEntry?: string;
      password?: string;
      fullfilename?: string;
    };
  }>("/onlinePreview", async (request, reply) => {
    const rawUrl = request.query.url;
    if (!rawUrl) {
      return reply
        .code(400)
        .type("text/html; charset=utf-8")
        .send(renderErrorPage("缺少 url 参数", 400));
    }

    if (config.previewPassword) {
      const provided = request.query.password || "";
      if (provided !== config.previewPassword) {
        return reply
          .code(401)
          .type("text/html; charset=utf-8")
          .send(
            renderPasswordGate({
              fields: request.query as Record<string, string | undefined>,
              error: provided ? "密码错误" : undefined,
            }),
          );
      }
    }

    let decoded: string;
    try {
      decoded = tryDecodeUrlParam(rawUrl);
    } catch {
      return reply
        .code(400)
        .type("text/html; charset=utf-8")
        .send("<h1>Invalid url encoding</h1>");
    }

    const result = await buildPreview({
      url: decoded,
      watermarkTxt: request.query.watermarkTxt,
      page: request.query.page ? Number(request.query.page) : undefined,
      highlight: request.query.highlight,
      forceUpdatedCache:
        request.query.forceUpdatedCache === "true" ||
        request.query.forceUpdatedCache === "1",
      archiveEntry: request.query.archiveEntry,
      password: request.query.password,
    });

    reply
      .code(result.status)
      .header(
        "Content-Security-Policy",
        config.allowEmbed
          ? "object-src 'none'; base-uri 'none'; frame-ancestors *"
          : "object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
      )
      .header("X-Content-Type-Options", "nosniff")
      .type("text/html; charset=utf-8")
      .send(result.html);
  });
}
