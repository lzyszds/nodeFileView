import fs from "node:fs";
import Fastify from "fastify";
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
import { initFileStore } from "./services/fileStore.js";
import { initMonitorStore } from "./services/monitor.js";
import { ensureDir } from "./utils/path.js";

async function main() {
  ensureDir(config.uploadsDir);
  ensureDir(config.cacheDir);
  ensureDir(config.tempDir);
  await initFileStore();
  initMonitorStore();

  const app = Fastify({
    logger: true,
    trustProxy: config.trustProxy,
    bodyLimit: config.maxUploadSizeBytes,
  });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
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
    // Electron <webview> / iframe 嵌入时，X-Frame-Options: SAMEORIGIN → ERR_BLOCKED_BY_RESPONSE
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

  // 生产（或显式开启）才托管前端构建产物；本地 pnpm dev 请用 Vite :5173，
  // 避免误开 :8012 时加载过期的 apps/web/dist 看到空白页。
  const serveWebDist =
    process.env.SERVE_WEB_DIST === "true" ||
    process.env.SERVE_WEB_DIST === "1" ||
    process.env.NODE_ENV === "production";

  if (serveWebDist && fs.existsSync(config.webDistDir)) {
    await app.register(fastifyStatic, {
      root: config.webDistDir,
      prefix: "/",
      wildcard: false,
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
      // SPA fallback: only bare routes, never dotted sensitive paths
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
  <title>nodeFileView · dev</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;color:#1e293b;line-height:1.5}
    code{background:#f1f5f9;padding:.1rem .35rem;border-radius:4px}
    a{color:#4f46e5}
  </style>
</head>
<body>
  <h1>nodeFileView API（开发模式）</h1>
  <p>当前 <code>:${config.port}</code> 只提供 API / 预览，不托管前端构建产物。</p>
  <p>控制台请打开：<a href="http://127.0.0.1:5173/">http://127.0.0.1:5173/</a></p>
  <p>健康检查：<a href="/health">/health</a></p>
</body>
</html>`);
    });
  }

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`nodeFileView listening on http://${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
