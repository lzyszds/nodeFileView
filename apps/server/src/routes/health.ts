import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { encodePreviewUrl } from "../services/security/aes.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ ok: true }));

  app.get("/api/config/public", async () => ({
    aesEnabled: config.aes.enabled,
    basicAuthEnabled: config.basicAuth.enabled,
    previewPasswordEnabled: Boolean(config.previewPassword),
    maxUploadSizeMb: Math.round(config.maxUploadSizeBytes / 1024 / 1024),
    ftpEnabled: false,
    allowEmbed: config.allowEmbed,
    blockPrivateIp: config.blockPrivateIp,
    trustHostConfigured: config.trustHost.length > 0,
    notTrustHostEnabled: config.notTrustHost.length > 0,
    rateLimitMax: config.rateLimit.max,
    rateLimitRemoteMax: config.rateLimit.remoteMax,
    convertMaxConcurrent: config.convertMaxConcurrent,
    remoteDownloadTimeoutMs: config.remoteDownloadTimeoutMs,
    cacheTtlDays: config.cache.ttlDays,
    remoteCacheTtlDays: config.cache.remoteTtlDays,
    baseUrl: config.baseUrl || undefined,
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
