export interface PublicConfig {
  aesEnabled: boolean;
  basicAuthEnabled: boolean;
  previewPasswordEnabled: boolean;
  maxUploadSizeMb: number;
  ftpEnabled: boolean;
  allowEmbed?: boolean;
  blockPrivateIp?: boolean;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  libreOfficePath?: string;
  convertTimeoutMs?: number;
  host?: string;
  port?: number;
  baseUrl?: string;
  trustHost?: string[];
  notTrustHostEnabled?: boolean;
}

export interface AuthStatus {
  enabled: boolean;
  authenticated: boolean;
  user: string | null;
}

export interface FileItem {
  fileId: string;
  name: string;
  size: number;
  ext: string;
  mime: string;
  createdAt: string;
  previewUrl: string;
}

export interface FileListResponse {
  total: number;
  page: number;
  size: number;
  items: FileItem[];
}

export interface MonitorEvent {
  id: number;
  ts: number;
  kind: string;
  level: "info" | "warn" | "error";
  message: string;
  detail?: Record<string, unknown>;
  durationMs?: number;
  cacheHit?: boolean;
}

export interface CacheBucket {
  count: number;
  bytes: number;
  removed?: number;
}

export interface MonitorStats {
  startedAt: number;
  uptimeMs: number;
  uptimeText?: string;
  previewTotal: number;
  previewToday: number;
  convertTotal: number;
  convertErrors: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  cacheHitRateText?: string;
  avgConvertMs: number;
  lastErrorAt: number | null;
  cache: {
    convert: CacheBucket;
    remote: CacheBucket;
    temp: CacheBucket;
    totalBytes: number;
  };
  server?: Record<string, unknown>;
}

export class AuthRequiredError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    throw new AuthRequiredError(
      (data as { error?: string }).error || "Unauthorized",
    );
  }
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText);
  }
  return data as T;
}

function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, credentials: "include" });
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await apiFetch("/api/auth/status");
  return parseJson(res);
}

export async function loginConsole(
  username: string,
  password: string,
): Promise<{ ok: boolean; user?: string }> {
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return parseJson(res);
}

export async function logoutConsole(): Promise<void> {
  const res = await apiFetch("/api/auth/logout", { method: "POST" });
  await parseJson(res);
}

export async function fetchPublicConfig(): Promise<PublicConfig> {
  const res = await apiFetch("/api/config/public");
  return parseJson(res);
}

export async function listFiles(params: {
  page: number;
  size: number;
  q: string;
}): Promise<FileListResponse> {
  const qs = new URLSearchParams({
    page: String(params.page),
    size: String(params.size),
    q: params.q,
  });
  const res = await apiFetch(`/api/files?${qs}`);
  return parseJson(res);
}

export async function uploadFile(file: File): Promise<FileItem & { localUrl: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch("/api/upload", { method: "POST", body: form });
  return parseJson(res);
}

export async function deleteFile(fileId: string): Promise<void> {
  const res = await apiFetch(`/api/files/${fileId}`, { method: "DELETE" });
  await parseJson(res);
}

export async function encodeUrl(url: string, useAes: boolean): Promise<string> {
  const res = await apiFetch("/api/encode-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, useAes }),
  });
  const data = await parseJson<{ encoded: string }>(res);
  return data.encoded;
}

export async function fetchMonitorStats(): Promise<MonitorStats> {
  const res = await apiFetch("/api/monitor/stats");
  return parseJson(res);
}

export async function fetchMonitorLogs(limit = 100): Promise<{
  total: number;
  items: MonitorEvent[];
}> {
  const res = await apiFetch(`/api/monitor/logs?limit=${limit}`);
  return parseJson(res);
}

export async function clearMonitorLogsApi(): Promise<{ removed: number }> {
  const res = await apiFetch("/api/monitor/logs", { method: "DELETE" });
  return parseJson(res);
}

export async function clearMonitorCache(
  scope: "convert" | "remote" | "temp" | "all",
): Promise<{ ok: boolean; result: Record<string, CacheBucket> }> {
  const res = await apiFetch("/api/monitor/cache/clear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope }),
  });
  return parseJson(res);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}
