import cluster from "node:cluster";
import fs from "node:fs";
import Fastify from "fastify";
import compress from "@fastify/compress";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { config } from "./config.js";
import { basicAuthHook } from "./middleware/auth.js";
import { assetRoutes } from "./routes/assets.js";
import { authRoutes } from "./routes/auth.js";
import { docxExportRoutes } from "./routes/docxExport.js";
import { fileRoutes } from "./routes/files.js";
import { healthRoutes } from "./routes/health.js";
import { demoRoutes } from "./routes/demo.js";
import { previewRoutes } from "./routes/preview.js";
import { rawRoutes } from "./routes/raw.js";
import { remoteRoutes } from "./routes/remote.js";
import { monitorRoutes } from "./routes/monitor.js";
import { startCacheCleanupScheduler } from "./services/cacheCleanup.js";
import { flushMeta, initFileStore } from "./services/fileStore.js";
import {
  flushMonitorStore,
  initMonitorStore,
} from "./services/monitor.js";
import { ensureDir } from "./utils/path.js";
import { assertStartupSecurity } from "./services/security/startupChecks.js";

function isPreviewReadPath(url: string): boolean {
  const pathOnly = (url.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  return (
    pathOnly === "/health" ||
    pathOnly.startsWith("/onlinePreview") ||
    pathOnly.startsWith("/api/cache/") ||
    pathOnly.startsWith("/api/raw/") ||
    pathOnly.startsWith("/api/temp/") ||
    pathOnly.startsWith("/api/archive/") ||
    pathOnly.startsWith("/assets/") ||
    pathOnly === "/assets"
  );
}

function resolveCorsOrigin(): boolean | string | string[] {
  if (config.corsOrigins.length) return config.corsOrigins;
  if (process.env.NODE_ENV === "production" && config.baseUrl) {
    return [config.baseUrl];
  }
  return true;
}

async function startServer(): Promise<void> {
  assertStartupSecurity();
  ensureDir(config.uploadsDir);
  ensureDir(config.cacheDir);
  ensureDir(config.tempDir);
  await initFileStore();
  initMonitorStore();
  startCacheCleanupScheduler();

  const app = Fastify({
    logger: config.logRequests ? true : { level: "warn" },
    trustProxy: config.trustProxy,
    bodyLimit: config.maxUploadSizeBytes,
    keepAliveTimeout: 72_000,
    requestTimeout: config.remoteDownloadTimeoutMs + 30_000,
  });

  if (config.compressEnabled) {
    await app.register(compress, {
      global: true,
      encodings: ["gzip", "deflate", "br"],
      threshold: 1024,
    });
  }

  await app.register(cors, {
    origin: resolveCorsOrigin(),
    credentials: true,
  });
  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
    allowList: (req) =>
      config.rateLimit.previewExempt && isPreviewReadPath(req.url),
  });
  await app.register(multipart, {
    limits: {
      fileSize: config.maxUploadSizeBytes,
      files: 1,
    },
  });

  app.addHook("onRequest", basicAuthHook);

  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    if (config.allowEmbed) {
      reply.removeHeader("X-Frame-Options");
    } else {
      reply.header("X-Frame-Options", "SAMEORIGIN");
    }
  });

  await authRoutes(app);
  await healthRoutes(app);
  await assetRoutes(app);
  await fileRoutes(app);
  await rawRoutes(app);
  await demoRoutes(app);
  await remoteRoutes(app);
  await docxExportRoutes(app);
  await monitorRoutes(app);
  await previewRoutes(app);

  const serveWebDist =
    process.env.SERVE_WEB_DIST === "true" ||
    process.env.SERVE_WEB_DIST === "1" ||
    process.env.NODE_ENV === "production";

  if (serveWebDist && fs.existsSync(config.webDistDir)) {
    await app.register(fastifyStatic, {
      root: config.webDistDir,
      prefix: "/",
      wildcard: false,
      setHeaders(res) {
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      },
    });
    app.setNotFoundHandler((request, reply) => {
      const pathOnly = request.url.split("?")[0] || "/";
      if (
        pathOnly.startsWith("/api") ||
        pathOnly.startsWith("/onlinePreview") ||
        pathOnly.startsWith("/health") ||
        pathOnly.startsWith("/assets")
      ) {
        return reply.code(404).send({ error: "Not found" });
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        return reply.code(404).send({ error: "Not found" });
      }
      if (pathOnly.includes("..") || /(^|\/)\./.test(pathOnly)) {
        return reply.code(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  } else if (!serveWebDist) {
    app.get("/", async (_request, reply) => {
      reply.type("text/html; charset=utf-8").send(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>filePreview · dev</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;color:#1e293b;line-height:1.5}
    code{background:#f1f5f9;padding:.1rem .35rem;border-radius:4px}
    a{color:#4f46e5}
  </style>
</head>
<body>
  <h1>filePreview API（开发模式）</h1>
  <p>当前 <code>:${config.port}</code> 只提供 API / 预览，不托管前端构建产物。</p>
  <p>控制台请打开：<a href="http://127.0.0.1:5173/">http://127.0.0.1:5173/</a></p>
  <p>健康检查：<a href="/health">/health</a></p>
</body>
</html>`);
    });
  }

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`filePreview listening on http://${config.host}:${config.port}`);

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down…`);
    await app.close();
    await flushMeta();
    await flushMonitorStore();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

function boot(): void {
  const workers =
    config.clusterWorkers > 1 ? config.clusterWorkers : 1;

  if (workers <= 1) {
    startServer().catch((err) => {
      console.error(err);
      process.exit(1);
    });
    return;
  }

  if (cluster.isPrimary) {
    console.info(`Primary ${process.pid} starting ${workers} workers`);
    for (let i = 0; i < workers; i++) cluster.fork();
    cluster.on("exit", (worker, code) => {
      console.warn(`Worker ${worker.process.pid} exited (${code}), restarting…`);
      cluster.fork();
    });
    return;
  }

  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

boot();
