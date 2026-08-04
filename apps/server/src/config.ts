import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");

dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config();

const schema = z.object({
  PORT: z.coerce.number().default(8013),
  HOST: z.string().default("0.0.0.0"),
  DATA_DIR: z.string().default("./data"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(200),
  BASIC_AUTH_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  BASIC_AUTH_USER: z.string().default("admin"),
  BASIC_AUTH_PASS: z.string().default("admin123"),
  AES_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  AES_KEY: z.string().default("0123456789abcdef"),
  AES_IV: z.string().default("0123456789abcdef"),
  PREVIEW_PASSWORD: z.string().default(""),
  BLOCK_PRIVATE_IP: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  RATE_LIMIT_MAX: z.coerce.number().default(60),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  LIBREOFFICE_PATH: z.string().default("soffice"),
  CONVERT_TIMEOUT_MS: z.coerce.number().default(120000),
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  /** 允许 iframe / Electron webview 嵌入预览页（默认开启） */
  ALLOW_EMBED: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
});

const env = schema.parse(process.env);

const dataDir = path.isAbsolute(env.DATA_DIR)
  ? env.DATA_DIR
  : path.resolve(rootDir, env.DATA_DIR);

export const config = {
  port: env.PORT,
  host: env.HOST,
  rootDir,
  dataDir,
  uploadsDir: path.join(dataDir, "uploads"),
  cacheDir: path.join(dataDir, "cache"),
  tempDir: path.join(dataDir, "temp"),
  maxUploadSizeBytes: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  basicAuth: {
    enabled: Boolean(env.BASIC_AUTH_ENABLED),
    user: env.BASIC_AUTH_USER,
    pass: env.BASIC_AUTH_PASS,
  },
  aes: {
    enabled: Boolean(env.AES_ENABLED),
    key: env.AES_KEY,
    iv: env.AES_IV,
  },
  previewPassword: env.PREVIEW_PASSWORD,
  blockPrivateIp: env.BLOCK_PRIVATE_IP !== false,
  rateLimit: {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
  },
  libreOfficePath: env.LIBREOFFICE_PATH,
  convertTimeoutMs: env.CONVERT_TIMEOUT_MS,
  trustProxy: Boolean(env.TRUST_PROXY),
  allowEmbed: env.ALLOW_EMBED !== false,
  webDistDir: path.resolve(rootDir, "apps/web/dist"),
};
