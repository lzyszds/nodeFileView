import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { encodePreviewUrl } from "../services/security/aes.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
    service: "nodeFileView",
    version: "1.0.0",
    aesEnabled: config.aes.enabled,
    basicAuthEnabled: config.basicAuth.enabled,
    previewPasswordEnabled: Boolean(config.previewPassword),
  }));

  app.get("/api/config/public", async () => ({
    aesEnabled: config.aes.enabled,
    basicAuthEnabled: config.basicAuth.enabled,
    previewPasswordEnabled: Boolean(config.previewPassword),
    maxUploadSizeMb: Math.round(config.maxUploadSizeBytes / 1024 / 1024),
    ftpEnabled: false,
    allowEmbed: config.allowEmbed,
    blockPrivateIp: config.blockPrivateIp,
    rateLimitMax: config.rateLimit.max,
    rateLimitWindowMs: config.rateLimit.timeWindow,
    libreOfficePath: config.libreOfficePath,
    convertTimeoutMs: config.convertTimeoutMs,
    host: config.host,
    port: config.port,
    baseUrl: config.baseUrl || undefined,
    trustHost: config.trustHost,
    notTrustHostEnabled: config.notTrustHost.length > 0,
  }));

  app.post<{
    Body: { url: string; useAes?: boolean };
  }>("/api/encode-url", async (request, reply) => {
    const url = request.body?.url;
    if (!url) return reply.code(400).send({ error: "url is required" });
    return {
      encoded: encodePreviewUrl(url, Boolean(request.body.useAes)),
    };
  });
}
