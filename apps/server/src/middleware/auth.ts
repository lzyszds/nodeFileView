import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

export async function basicAuthHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!config.basicAuth.enabled) return;

  const header = request.headers.authorization;
  if (!header?.startsWith("Basic ")) {
    reply.header("WWW-Authenticate", 'Basic realm="nodeFileView"');
    return reply.code(401).send({ error: "Unauthorized" });
  }

  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  const user = sep >= 0 ? decoded.slice(0, sep) : decoded;
  const pass = sep >= 0 ? decoded.slice(sep + 1) : "";

  if (user !== config.basicAuth.user || pass !== config.basicAuth.pass) {
    reply.header("WWW-Authenticate", 'Basic realm="nodeFileView"');
    return reply.code(401).send({ error: "Unauthorized" });
  }
}
