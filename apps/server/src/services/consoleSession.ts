import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

export const CONSOLE_COOKIE = "nfv_console";
const MAX_AGE_SEC = 7 * 24 * 60 * 60;

function sessionSecret(): string {
  return `nfv:${config.basicAuth.user}:${config.basicAuth.pass}`;
}

function sign(payload: string): string {
  const sig = crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

function verify(token: string): { user: string; exp: number } | null {
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const match = /^u:([^:]+):exp:(\d+)$/.exec(payload);
  if (!match) return null;
  const user = match[1];
  const exp = Number(match[2]);
  if (!user || !Number.isFinite(exp) || Date.now() > exp) return null;
  if (user !== config.basicAuth.user) return null;
  return { user, exp };
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    const dummy = Buffer.alloc(ba.length);
    crypto.timingSafeEqual(ba, dummy);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

export function readCookie(
  request: FastifyRequest,
  name: string,
): string | undefined {
  const raw = request.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

export function createConsoleSessionToken(user: string): string {
  const exp = Date.now() + MAX_AGE_SEC * 1000;
  return sign(`u:${user}:exp:${exp}`);
}

export function setConsoleSessionCookie(
  reply: FastifyReply,
  token: string,
): void {
  const secure = config.trustProxy ? "; Secure" : "";
  reply.header(
    "Set-Cookie",
    `${CONSOLE_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SEC}${secure}`,
  );
}

export function clearConsoleSessionCookie(reply: FastifyReply): void {
  reply.header(
    "Set-Cookie",
    `${CONSOLE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

export function getConsoleSessionUser(
  request: FastifyRequest,
): string | null {
  const token = readCookie(request, CONSOLE_COOKIE);
  if (!token) return null;
  const parsed = verify(token);
  return parsed?.user ?? null;
}

export function checkBasicCredentials(
  user: string,
  pass: string,
): boolean {
  return (
    safeEqual(user, config.basicAuth.user) &&
    safeEqual(pass, config.basicAuth.pass)
  );
}

export function parseBasicAuthHeader(
  header: string | undefined,
): { user: string; pass: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep < 0) return null;
    return {
      user: decoded.slice(0, sep),
      pass: decoded.slice(sep + 1),
    };
  } catch {
    return null;
  }
}

export function isConsoleAuthenticated(request: FastifyRequest): boolean {
  if (getConsoleSessionUser(request)) return true;
  const basic = parseBasicAuthHeader(request.headers.authorization);
  if (!basic) return false;
  return checkBasicCredentials(basic.user, basic.pass);
}
