import { config } from "../../config.js";

const WEAK_PASSWORDS = new Set([
  "admin123",
  "admin",
  "password",
  "123456",
  "change-me-strong-password",
]);

const DEFAULT_AES_SECRET = "0123456789abcdef";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** 生产环境启动前安全校验，弱配置直接拒绝启动 */
export function assertStartupSecurity(): void {
  if (!isProduction()) return;

  if (config.basicAuth.enabled) {
    const pass = config.basicAuth.pass.trim();
    if (!pass || pass.length < 8 || WEAK_PASSWORDS.has(pass)) {
      throw new Error(
        "Refusing to start: set a strong BASIC_AUTH_PASS (≥8 chars, not a default) when BASIC_AUTH_ENABLED=true in production.",
      );
    }
  }

  if (config.aes.enabled) {
    if (
      config.aes.key === DEFAULT_AES_SECRET ||
      config.aes.iv === DEFAULT_AES_SECRET
    ) {
      throw new Error(
        "Refusing to start: AES_ENABLED=true requires non-default AES_KEY and AES_IV.",
      );
    }
  }

  if (config.trustHost.length === 0) {
    throw new Error(
      "Refusing to start: TRUST_HOST must be set in production to restrict remote file fetching.",
    );
  }
}
