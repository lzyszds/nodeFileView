import fs from "node:fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { config } from "./config.js";
import { basicAuthHook } from "./middleware/auth.js";
import { fileRoutes } from "./routes/files.js";
import { healthRoutes } from "./routes/health.js";
import { previewRoutes } from "./routes/preview.js";
import { rawRoutes } from "./routes/raw.js";
import { initFileStore } from "./services/fileStore.js";
import { ensureDir } from "./utils/path.js";

async function main() {
  ensureDir(config.uploadsDir);
  ensureDir(config.cacheDir);
  ensureDir(config.tempDir);
  await initFileStore();

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
    reply.header("X-Frame-Options", "SAMEORIGIN");
    reply.header("Referrer-Policy", "no-referrer");
  });

  await healthRoutes(app);
  await fileRoutes(app);
  await rawRoutes(app);
  await previewRoutes(app);

  if (fs.existsSync(config.webDistDir)) {
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
        pathOnly.startsWith("/health")
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
  }

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`nodeFileView listening on http://${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
