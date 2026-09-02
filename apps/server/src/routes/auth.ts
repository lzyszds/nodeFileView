import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import {
  checkBasicCredentials,
  clearConsoleSessionCookie,
  createConsoleSessionToken,
  getConsoleSessionUser,
  isConsoleAuthenticated,
  setConsoleSessionCookie,
} from "../services/consoleSession.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/auth/status", async (request) => {
    const enabled = config.basicAuth.enabled;
    return {
      enabled,
      authenticated: enabled ? isConsoleAuthenticated(request) : true,
      user: enabled ? getConsoleSessionUser(request) : null,
    };
  });

  app.post<{
    Body: { username?: string; password?: string };
  }>(
    "/api/auth/login",
    {
      config: {
        rateLimit: {
          max: config.rateLimit.loginMax,
          timeWindow: config.rateLimit.timeWindow,
        },
      },
    },
    async (request, reply) => {
    if (!config.basicAuth.enabled) {
      return { ok: true, enabled: false };
    }
    const username = String(request.body?.username ?? "");
    const password = String(request.body?.password ?? "");
    if (!checkBasicCredentials(username, password)) {
      return reply.code(401).send({ error: "账号或密码错误" });
    }
    const token = createConsoleSessionToken(username);
    setConsoleSessionCookie(reply, token);
    return { ok: true, user: username };
  },
  );

  app.post("/api/auth/logout", async (_request, reply) => {
    clearConsoleSessionCookie(reply);
    return { ok: true };
  });
}
