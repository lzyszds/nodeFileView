import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import {
  clearCaches,
  clearMonitorLogs,
  getCacheInventory,
  getMonitorLogs,
  getMonitorStats,
} from "../services/monitor.js";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export async function monitorRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/monitor/stats", async () => {
    const stats = getMonitorStats();
    const cache = await getCacheInventory();
    return {
      ...stats,
      uptimeText: formatDuration(stats.uptimeMs),
      cacheHitRateText: `${(stats.cacheHitRate * 100).toFixed(1)}%`,
      cache,
      server: {
        host: config.host,
        port: config.port,
        dataDir: config.dataDir,
        libreOfficePath: config.libreOfficePath,
        convertTimeoutMs: config.convertTimeoutMs,
        allowEmbed: config.allowEmbed,
        blockPrivateIp: config.blockPrivateIp,
        rateLimit: config.rateLimit,
      },
    };
  });

  app.get<{
    Querystring: { limit?: string };
  }>("/api/monitor/logs", async (request) => {
    const limit = Number(request.query.limit || 100);
    return {
      total: getMonitorLogs(500).length,
      items: getMonitorLogs(Number.isFinite(limit) ? limit : 100),
    };
  });

  app.delete("/api/monitor/logs", async () => {
    const removed = clearMonitorLogs();
    return { ok: true, removed };
  });

  app.get("/api/monitor/cache", async () => getCacheInventory());

  app.post<{
    Body: { scope?: "convert" | "remote" | "temp" | "all" };
  }>("/api/monitor/cache/clear", async (request) => {
    const scope = request.body?.scope || "all";
    if (!["convert", "remote", "temp", "all"].includes(scope)) {
      return { ok: false, error: "invalid scope" };
    }
    const result = await clearCaches(scope);
    return { ok: true, scope, result };
  });
}
