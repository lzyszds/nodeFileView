import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");

dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config();

const boolish = (v: string | undefined, defaultTrue: boolean) => {
  if (v === undefined || v === "") return defaultTrue;
  return v === "true" || v === "1";
};

/** 默认禁止的内网/本机/链路本地主机（可用 NOT_TRUST_HOST 覆盖） */
export const DEFAULT_NOT_TRUST_HOST =
  "localhost,127.0.0.1,0.0.0.0,::1,169.254.*,192.168.*,10.*,172.16.*,172.17.*,172.18.*,172.19.*,172.20.*,172.21.*,172.22.*,172.23.*,172.24.*,172.25.*,172.26.*,172.27.*,172.28.*,172.29.*,172.30.*,172.31.*,100.64.*,metadata.google.internal";

function splitHostList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const schema = z.object({
  PORT: z.coerce.number().default(6001),
  HOST: z.string().default("0.0.0.0"),
  DATA_DIR: z.string().default("./data"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(100),
  MAX_ARCHIVE_ENTRY_MB: z.coerce.number().default(100),
  BASIC_AUTH_ENABLED: z.string().optional(),
  BASIC_AUTH_USER: z.string().default("admin"),
  /** 控制台默认密码（公司内网 git；可用环境变量覆盖） */
  BASIC_AUTH_PASS: z.string().default("A6T+%iOG_n{y*RXo"),
  AES_ENABLED: z.string().optional(),
  AES_KEY: z.string().default("0123456789abcdef"),
  AES_IV: z.string().default("0123456789abcdef"),
  PREVIEW_PASSWORD: z.string().default(""),
  BLOCK_PRIVATE_IP: z.string().optional(),
  RATE_LIMIT_MAX: z.coerce.number().default(300),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  /** 上传接口单独限流（防刷）；0=与 RATE_LIMIT_MAX 相同 */
  RATE_LIMIT_UPLOAD_MAX: z.coerce.number().default(30),
  /** 预览读路径（onlinePreview / api/cache 等）豁免全局限流；/api/remote 单独限流 */
  RATE_LIMIT_PREVIEW_EXEMPT: z.string().optional(),
  /** /api/remote 单独限流（次/窗口） */
  RATE_LIMIT_REMOTE_MAX: z.coerce.number().default(120),
  /** 登录接口 brute-force 限流（次/窗口） */
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().default(10),
  /** CORS 允许来源，逗号分隔；空=开发反射任意 Origin，生产可用 BASE_URL */
  CORS_ORIGINS: z.string().default(""),
  LIBREOFFICE_PATH: z.string().default("soffice"),
  CONVERT_TIMEOUT_MS: z.coerce.number().default(120000),
  /** 同时进行的 LibreOffice 转码数；0=不限制（不推荐） */
  CONVERT_MAX_CONCURRENT: z.coerce.number().default(2),
  /** 远程文件下载超时（毫秒），IM 弱网建议 120000+ */
  REMOTE_DOWNLOAD_TIMEOUT_MS: z.coerce.number().default(120000),
  /** 远程缓存命中内存 TTL（毫秒），减轻磁盘 stat */
  HOT_REMOTE_CACHE_MS: z.coerce.number().default(60_000),
  /** Node cluster worker 数；0 或 1=单进程 */
  CLUSTER_WORKERS: z.coerce.number().default(0),
  /** 响应 gzip/br 压缩（HTML/JSON/SVG 等） */
  COMPRESS_ENABLED: z.string().optional(),
  /** 生产环境关闭 per-request 访问日志以减 I/O */
  LOG_REQUESTS: z.string().optional(),
  TRUST_PROXY: z.string().optional(),
  ALLOW_EMBED: z.string().optional(),
  /** 对外访问基址，如 https://preview.example.com（Docker 注入） */
  BASE_URL: z.string().default(""),
  /** 允许拉取的远程主机白名单，空=不额外限制（仍受 NOT_TRUST / 私网规则约束） */
  TRUST_HOST: z.string().default(""),
  /** 禁止拉取的主机/网段，支持 * 通配 */
  NOT_TRUST_HOST: z.string().default(DEFAULT_NOT_TRUST_HOST),
  /** 转码 PDF 磁盘缓存保留天数（按 mtime） */
  CACHE_TTL_DAYS: z.coerce.number().default(7),
  /** 远程文件磁盘缓存保留天数（按 meta.cachedAt / mtime） */
  REMOTE_CACHE_TTL_DAYS: z.coerce.number().default(7),
  /** serve-/arc- 等临时文件保留小时数 */
  TEMP_TTL_HOURS: z.coerce.number().default(24),
  /** 后台清理间隔（毫秒），0=禁用定时清理 */
  CACHE_CLEANUP_INTERVAL_MS: z.coerce.number().default(3_600_000),
  /** 缓存总容量上限（MB，含 convert+remote+temp），0=不限制 */
  CACHE_MAX_MB: z.coerce.number().default(0),
});

const env = schema.parse(process.env);

const dataDir = path.isAbsolute(env.DATA_DIR)
  ? env.DATA_DIR
  : path.resolve(rootDir, env.DATA_DIR);

const trustHost = splitHostList(env.TRUST_HOST);
const notTrustHost = splitHostList(
  env.NOT_TRUST_HOST.trim() ? env.NOT_TRUST_HOST : DEFAULT_NOT_TRUST_HOST,
);

export const config = {
  port: env.PORT,
  host: env.HOST,
  rootDir,
  dataDir,
  uploadsDir: path.join(dataDir, "uploads"),
  cacheDir: path.join(dataDir, "cache"),
  tempDir: path.join(dataDir, "temp"),
  maxUploadSizeBytes: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  maxArchiveEntryBytes: env.MAX_ARCHIVE_ENTRY_MB * 1024 * 1024,
  basicAuth: {
    // 默认也启用控制台登录，避免开发模式绕过鉴权而无法验证登录流程。
    // 仅在需要本地直通时显式设置 BASIC_AUTH_ENABLED=false。
    enabled: boolish(env.BASIC_AUTH_ENABLED, true),
    user: env.BASIC_AUTH_USER,
    pass: env.BASIC_AUTH_PASS,
  },
  aes: {
    enabled: boolish(env.AES_ENABLED, false),
    key: env.AES_KEY,
    iv: env.AES_IV,
  },
  previewPassword: env.PREVIEW_PASSWORD,
  blockPrivateIp: boolish(env.BLOCK_PRIVATE_IP, true),
  rateLimit: {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    uploadMax:
      env.RATE_LIMIT_UPLOAD_MAX > 0
        ? env.RATE_LIMIT_UPLOAD_MAX
        : env.RATE_LIMIT_MAX,
    previewExempt: boolish(env.RATE_LIMIT_PREVIEW_EXEMPT, true),
    remoteMax: Math.max(1, env.RATE_LIMIT_REMOTE_MAX),
    loginMax: Math.max(1, env.RATE_LIMIT_LOGIN_MAX),
  },
  libreOfficePath: env.LIBREOFFICE_PATH,
  convertTimeoutMs: env.CONVERT_TIMEOUT_MS,
  convertMaxConcurrent: Math.max(0, env.CONVERT_MAX_CONCURRENT),
  remoteDownloadTimeoutMs: Math.max(5_000, env.REMOTE_DOWNLOAD_TIMEOUT_MS),
  hotRemoteCacheMs: Math.max(0, env.HOT_REMOTE_CACHE_MS),
  clusterWorkers: Math.max(0, env.CLUSTER_WORKERS),
  compressEnabled: boolish(env.COMPRESS_ENABLED, true),
  logRequests: boolish(env.LOG_REQUESTS, process.env.NODE_ENV !== "production"),
  trustProxy: boolish(env.TRUST_PROXY, false),
  allowEmbed: boolish(env.ALLOW_EMBED, true),
  corsOrigins: env.CORS_ORIGINS.split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean),
  baseUrl: env.BASE_URL.replace(/\/$/, ""),
  trustHost,
  notTrustHost,
  cache: {
    ttlMs: Math.max(0, env.CACHE_TTL_DAYS) * 24 * 60 * 60 * 1000,
    remoteTtlMs: Math.max(0, env.REMOTE_CACHE_TTL_DAYS) * 24 * 60 * 60 * 1000,
    tempTtlMs: Math.max(0, env.TEMP_TTL_HOURS) * 60 * 60 * 1000,
    cleanupIntervalMs: Math.max(0, env.CACHE_CLEANUP_INTERVAL_MS),
    maxBytes:
      env.CACHE_MAX_MB > 0
        ? Math.floor(env.CACHE_MAX_MB * 1024 * 1024)
        : 0,
    ttlDays: Math.max(0, env.CACHE_TTL_DAYS),
    remoteTtlDays: Math.max(0, env.REMOTE_CACHE_TTL_DAYS),
    tempTtlHours: Math.max(0, env.TEMP_TTL_HOURS),
    maxMb: Math.max(0, env.CACHE_MAX_MB),
  },
  webDistDir: path.resolve(rootDir, "apps/web/dist"),
};
