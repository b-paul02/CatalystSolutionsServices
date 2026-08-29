// LeadOS crypto helpers: random tokens, hashing, and AES-256-GCM field
// encryption for high-risk values at rest (TOTP secrets, evidence refs).
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

function key(): Buffer {
  const secret = process.env.LEADOS_SECRET ?? process.env.ADMIN_SESSION_SECRET ?? "dev-secret";
  // Static salt is fine: this derives one stable app key from the env secret.
  return scryptSync(secret, "leados-field-key", 32);
}

/** URL-safe random token (default 32 bytes ≈ 43 chars). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256 hex — for storing lookups of single-use tokens / API keys / sessions. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** AES-256-GCM encrypt → "iv.tag.ciphertext" (base64url). */
export function encryptField(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptField(stored: string): string {
  const [iv, tag, data] = stored.split(".");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** decryptField that returns null instead of throwing (wrong key / tampered). */
export function tryDecryptField(stored: string): string | null {
  try {
    return decryptField(stored);
  } catch {
    return null;
  }
}
