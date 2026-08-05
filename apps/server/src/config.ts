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
  PORT: z.coerce.number().default(8012),
  HOST: z.string().default("0.0.0.0"),
  DATA_DIR: z.string().default("./data"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(200),
  MAX_ARCHIVE_ENTRY_MB: z.coerce.number().default(100),
  BASIC_AUTH_ENABLED: z.string().optional(),
  BASIC_AUTH_USER: z.string().default("admin"),
  BASIC_AUTH_PASS: z.string().default("admin123"),
  AES_ENABLED: z.string().optional(),
  AES_KEY: z.string().default("0123456789abcdef"),
  AES_IV: z.string().default("0123456789abcdef"),
  PREVIEW_PASSWORD: z.string().default(""),
  BLOCK_PRIVATE_IP: z.string().optional(),
  RATE_LIMIT_MAX: z.coerce.number().default(60),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  LIBREOFFICE_PATH: z.string().default("soffice"),
  CONVERT_TIMEOUT_MS: z.coerce.number().default(120000),
  TRUST_PROXY: z.string().optional(),
  ALLOW_EMBED: z.string().optional(),
  /** 对外访问基址，如 https://preview.example.com（Docker 注入） */
  BASE_URL: z.string().default(""),
  /** 允许拉取的远程主机白名单，空=不额外限制（仍受 NOT_TRUST / 私网规则约束） */
  TRUST_HOST: z.string().default(""),
  /** 禁止拉取的主机/网段，支持 * 通配 */
  NOT_TRUST_HOST: z.string().default(DEFAULT_NOT_TRUST_HOST),
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
    enabled: boolish(env.BASIC_AUTH_ENABLED, false),
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
  },
  libreOfficePath: env.LIBREOFFICE_PATH,
  convertTimeoutMs: env.CONVERT_TIMEOUT_MS,
  trustProxy: boolish(env.TRUST_PROXY, false),
  allowEmbed: boolish(env.ALLOW_EMBED, true),
  baseUrl: env.BASE_URL.replace(/\/$/, ""),
  trustHost,
  notTrustHost,
  webDistDir: path.resolve(rootDir, "apps/web/dist"),
};
