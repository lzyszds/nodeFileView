import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { FastifyInstance } from "fastify";

const require = createRequire(import.meta.url);

function resolveAsset(entryModule: string, relativeFromPkgRoot: string): string {
  // Prefer resolving the package entry, then walk up to package root.
  const entry = require.resolve(entryModule);
  let dir = path.dirname(entry);
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return path.join(dir, relativeFromPkgRoot);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(path.dirname(entry), "..", relativeFromPkgRoot);
}

const ASSETS: Record<string, string> = {
  "jszip.min.js": resolveAsset("jszip", "dist/jszip.min.js"),
  "docx-preview.min.js": resolveAsset(
    "docx-preview",
    "dist/docx-preview.min.js",
  ),
  "xlsx.full.min.js": resolveAsset("xlsx", "dist/xlsx.full.min.js"),
};

export async function assetRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { name: string } }>(
    "/assets/:name",
    async (request, reply) => {
      const name = path.basename(request.params.name);
      const abs = ASSETS[name];
      if (!abs || !fs.existsSync(abs)) {
        return reply.code(404).send({ error: "Asset not found" });
      }
      const type = name.endsWith(".css")
        ? "text/css; charset=utf-8"
        : "application/javascript; charset=utf-8";
      reply.header("Cache-Control", "public, max-age=604800, immutable");
      return reply.type(type).send(fs.createReadStream(abs));
    },
  );
}
