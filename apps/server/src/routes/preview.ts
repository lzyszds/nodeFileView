import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import {
  LANG_COOKIE,
  localeFromRequest,
  runWithLocale,
  t,
} from "../i18n/index.js";
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
      lang?: string;
    };
  }>("/onlinePreview", async (request, reply) => {
    const locale = localeFromRequest({
      queryLang: request.query.lang,
      cookieHeader: request.headers.cookie,
      acceptLanguage: request.headers["accept-language"],
    });

    if (request.query.lang) {
      reply.header(
        "Set-Cookie",
        `${LANG_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`,
      );
    }

    return runWithLocale(locale, async () => {
      const rawUrl = request.query.url;
      if (!rawUrl) {
        return reply
          .code(400)
          .type("text/html; charset=utf-8")
          .send(renderErrorPage(t("preview.missingUrl"), 400));
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
                error: provided ? t("preview.passwordWrong") : undefined,
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
          .send(renderErrorPage(t("preview.invalidEncoding"), 400));
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
            ? "object-src 'none'; base-uri 'none'; frame-ancestors * file:"
            : "object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
        )
        .header("X-Content-Type-Options", "nosniff")
        .type("text/html; charset=utf-8")
        .send(result.html);
    });
  });
}
