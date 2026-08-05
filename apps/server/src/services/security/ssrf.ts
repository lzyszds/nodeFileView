import dns from "node:dns/promises";
import net from "node:net";
import { config } from "../../config.js";

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  const ranges: Array<[number, number]> = [
    [ipv4ToInt("0.0.0.0"), ipv4ToInt("0.255.255.255")],
    [ipv4ToInt("10.0.0.0"), ipv4ToInt("10.255.255.255")],
    [ipv4ToInt("100.64.0.0"), ipv4ToInt("100.127.255.255")],
    [ipv4ToInt("127.0.0.0"), ipv4ToInt("127.255.255.255")],
    [ipv4ToInt("169.254.0.0"), ipv4ToInt("169.254.255.255")],
    [ipv4ToInt("172.16.0.0"), ipv4ToInt("172.31.255.255")],
    [ipv4ToInt("192.0.0.0"), ipv4ToInt("192.0.0.255")],
    [ipv4ToInt("192.168.0.0"), ipv4ToInt("192.168.255.255")],
    [ipv4ToInt("224.0.0.0"), ipv4ToInt("255.255.255.255")],
  ];
  return ranges.some(([start, end]) => n >= start && n <= end);
}

function extractMappedIpv4(ip: string): string | null {
  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    const rest = lower.slice("::ffff:".length);
    if (net.isIP(rest) === 4) return rest;
  }
  return null;
}

function isPrivateIpv6(ip: string): boolean {
  const mapped = extractMappedIpv4(ip);
  if (mapped) return isPrivateIpv4(mapped);

  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80")) return true;
  return false;
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIP(ip) === 4) return isPrivateIpv4(ip);
  if (net.isIP(ip) === 6) return isPrivateIpv6(ip);
  return true;
}

/** `*.example.com` / `10.*` / `172.16.*` → RegExp */
export function hostPatternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .toLowerCase()
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

export function hostMatchesAny(host: string, patterns: string[]): boolean {
  if (!patterns.length) return false;
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return patterns.some((p) => hostPatternToRegExp(p).test(h));
}

async function assertHostAllowed(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (hostMatchesAny(host, config.notTrustHost)) {
    throw new Error(`Host is not trusted: ${host}`);
  }

  if (config.trustHost.length > 0 && !hostMatchesAny(host, config.trustHost)) {
    throw new Error(`Host is not in TRUST_HOST allowlist: ${host}`);
  }

  if (!config.blockPrivateIp) return;

  if (net.isIP(host)) {
    if (isPrivateIp(host)) {
      throw new Error("Private IP addresses are blocked");
    }
    return;
  }

  const records = await dns.lookup(host, { all: true });
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error("URL resolves to a private IP address");
    }
    if (hostMatchesAny(record.address, config.notTrustHost)) {
      throw new Error(`Resolved address is not trusted: ${record.address}`);
    }
  }
}

export async function assertSafeRemoteUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed");
  }

  await assertHostAllowed(url.hostname);
  return url;
}

const MAX_REDIRECTS = 5;

/**
 * 安全拉取：每跳重定向都重新跑 TRUST_HOST / NOT_TRUST_HOST / 私网校验。
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
): Promise<Response> {
  let current = await assertSafeRemoteUrl(rawUrl);
  const headers = new Headers(init.headers || {});
  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", "nodeFileView/1.0");
  }

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const res = await fetch(current, {
      ...init,
      headers,
      redirect: "manual",
      signal: init.signal,
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        throw new Error(`Redirect without Location (${res.status})`);
      }
      const next = new URL(loc, current);
      current = await assertSafeRemoteUrl(next.toString());
      continue;
    }

    return res;
  }

  throw new Error("Too many redirects");
}
