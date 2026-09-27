// LeadOS crypto helpers: random tokens, hashing, and AES-256-GCM field
// encryption for high-risk values at rest (TOTP secrets, evidence refs).
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

// Key handling (no public fallback):
//  - New values are written as "k2.iv.tag.data" under LEADOS_SECRET, which is REQUIRED.
//  - Legacy 3-part values (written before key versioning) are still readable: we try
//    LEADOS_SECRET, then LEADOS_LEGACY_SECRET, then ADMIN_SESSION_SECRET — whichever key
//    the deployment actually used. scripts/rotate-field-keys.ts re-writes them as k2.
const derived = new Map<string, Buffer>();
const derive = (secret: string): Buffer => {
  let k = derived.get(secret);
  // Static salt is fine: this derives one stable app key from the env secret.
  if (!k) { k = scryptSync(secret, "leados-field-key", 32); derived.set(secret, k); }
  return k;
};

function currentKey(): Buffer {
  const secret = process.env.LEADOS_SECRET;
  if (!secret) throw new Error("LEADOS_SECRET is not set — field encryption is unavailable.");
  return derive(secret);
}

function legacyKeys(): Buffer[] {
  const secrets = [process.env.LEADOS_SECRET, process.env.LEADOS_LEGACY_SECRET, process.env.ADMIN_SESSION_SECRET];
  return [...new Set(secrets.filter((s): s is string => Boolean(s)))].map(derive);
}
/** URL-safe random token (default 32 bytes ≈ 43 chars). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256 hex — for storing lookups of single-use tokens / API keys / sessions. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const KEY_VERSION = "k2";

/** AES-256-GCM encrypt → "k2.iv.tag.ciphertext" (base64url). */
export function encryptField(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", currentKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${KEY_VERSION}.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}

/** True for values written before key versioning — candidates for scripts/rotate-field-keys.ts. */
export const needsReencrypt = (stored: string): boolean => !stored.startsWith(`${KEY_VERSION}.`);

function open(k: Buffer, iv: string, tag: string, data: string): string {
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function decryptField(stored: string): string {
  const parts = stored.split(".");
  if (parts.length === 4 && parts[0] === KEY_VERSION) return open(currentKey(), parts[1], parts[2], parts[3]);
  if (parts.length !== 3) throw new Error("Unrecognised ciphertext.");
  let last: unknown = new Error("No decryption key configured.");
  for (const k of legacyKeys()) {
    try { return open(k, parts[0], parts[1], parts[2]); } catch (e) { last = e; }
  }
  throw last;
}
/** decryptField that returns null instead of throwing (wrong key / tampered). */
export function tryDecryptField(stored: string): string | null {
  try {
    return decryptField(stored);
  } catch {
    return null;
  }
}
