/** 持久化 / 对外返回前脱敏 URL、本地路径等敏感字段 */
export function redactUrl(raw: string, maxLen = 120): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.search) u.search = "?[redacted]";
    if (u.hash) u.hash = "";
    return u.toString().slice(0, maxLen);
  } catch {
    return trimmed.replace(/([?&])(auth|token|sign|signature|key)=[^&]*/gi, "$1$2=[redacted]").slice(0, maxLen);
  }
}

export function redactMonitorDetail(
  detail?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!detail) return detail;
  const out: Record<string, unknown> = { ...detail };
  for (const key of ["url", "absPath", "path", "sourcePath"] as const) {
    const v = out[key];
    if (typeof v === "string") {
      out[key] =
        key === "url" ? redactUrl(v) : v.replace(/\/Users\/[^/]+/g, "/~").slice(0, 160);
    }
  }
  if (typeof out.error === "string") {
    out.error = out.error
      .replace(/https?:\/\/\S+/gi, (m) => redactUrl(m))
      .slice(0, 240);
  }
  return out;
}

/** 返回给客户端的安全错误文案（不泄露主机名 / 内网信息） */
export function publicRemoteError(err: unknown): string {
  if (!(err instanceof Error)) return "Remote fetch failed";
  const msg = err.message;
  if (/Host is not trusted|not in TRUST_HOST|Private IP|Invalid URL|exceeds max size|not allowed/i.test(msg)) {
    return msg.includes("max size")
      ? "Remote file exceeds max size"
      : msg.includes("not allowed")
        ? "Remote file type is not allowed"
        : "Remote URL is not allowed";
  }
  if (/abort|timeout|timed out/i.test(msg)) return "Remote download timed out";
  if (/HTTP \d+/i.test(msg)) return "Remote fetch failed";
  return "Remote fetch failed";
}
