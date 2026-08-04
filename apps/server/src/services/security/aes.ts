import crypto from "node:crypto";
import { config } from "../../config.js";

function normalizeKey(input: string, length: number): Buffer {
  const buf = Buffer.from(input, "utf8");
  if (buf.length === length) return buf;
  const out = Buffer.alloc(length);
  buf.copy(out, 0, 0, Math.min(buf.length, length));
  return out;
}

export function aesEncrypt(plain: string): string {
  const key = normalizeKey(config.aes.key, 16);
  const iv = normalizeKey(config.aes.iv, 16);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  return encrypted.toString("base64");
}

export function aesDecrypt(cipherText: string): string {
  const key = normalizeKey(config.aes.key, 16);
  const iv = normalizeKey(config.aes.iv, 16);
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherText, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function tryDecodeUrlParam(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  if (config.aes.enabled) {
    try {
      return aesDecrypt(trimmed);
    } catch {
      // fall through to base64 / plain
    }
  }

  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    if (/^https?:\/\//i.test(decoded) || decoded.startsWith("file://local/")) {
      return decoded;
    }
  } catch {
    // ignore
  }

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

export function encodePreviewUrl(fileUrl: string, useAes: boolean): string {
  if (useAes || config.aes.enabled) {
    return aesEncrypt(fileUrl);
  }
  return Buffer.from(fileUrl, "utf8").toString("base64");
}
