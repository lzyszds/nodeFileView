import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { isConsoleAuthenticated } from "../services/consoleSession.js";

/** 预览链路与登录接口：不要求控制台账号（避免 iframe / 分享链接被挡） */
const PUBLIC_PREFIXES = [
  "/health",
  "/onlinePreview",
  "/assets/",
  "/api/raw/",
  "/api/cache/",
  "/api/archive/",
  "/api/remote",
  "/api/docx/",
  "/api/auth/",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/assets" || pathname.startsWith("/assets/")) return true;
  if (pathname === "/api/remote") return true;
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p),
  );
}

/**
 * 控制台锁：BASIC_AUTH_ENABLED=true 时，管理 API / demo / SPA 需登录。
 * 仍接受 Cookie 会话或 Authorization: Basic（便于 curl）。
 * 不发 WWW-Authenticate，避免浏览器原生弹窗盖住 React 登录页。
 */
export async function basicAuthHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!config.basicAuth.enabled) return;

  const pathname = (request.url.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  // 静态首页与打包资源放行，由前端登录页拦截；API 才真正鉴权
  if (
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname.startsWith("/assets/") ||
    /\.(js|css|map|ico|svg|png|jpg|webp|woff2?)$/i.test(pathname)
  ) {
    return;
  }
  if (isPublicPath(pathname)) return;

  if (isConsoleAuthenticated(request)) return;

  return reply.code(401).send({ error: "Unauthorized", authRequired: true });
}
