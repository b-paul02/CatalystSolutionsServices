import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateTotpSecret, totpCode, verifyTotp } from "@/lib/leados/totp";
import { decryptField, encryptField, randomToken, sha256 } from "@/lib/leados/crypto";

describe("TOTP (RFC 6238)", () => {
  // RFC 6238 SHA-1 test secret "12345678901234567890" = base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
  const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

  it("matches the RFC 6238 SHA-1 test vectors (last 6 digits)", () => {
    // Appendix B: T=59s → 94287082, T=1111111109 → 07081804, T=1234567890 → 89005924
    expect(totpCode(SECRET, 59_000)).toBe("287082");
    expect(totpCode(SECRET, 1_111_111_109_000)).toBe("081804");
    expect(totpCode(SECRET, 1_234_567_890_000)).toBe("005924");
  });

  it("verifies with ±1 step drift and rejects garbage", () => {
    const t = 1_234_567_890_000;
    expect(verifyTotp(SECRET, totpCode(SECRET, t), t)).toBe(true);
    expect(verifyTotp(SECRET, totpCode(SECRET, t - 30_000), t)).toBe(true);
    expect(verifyTotp(SECRET, totpCode(SECRET, t - 90_000), t)).toBe(false);
    expect(verifyTotp(SECRET, "000000", t)).toBe(totpCode(SECRET, t) === "000000");
    expect(verifyTotp(SECRET, "12345", t)).toBe(false);
    expect(verifyTotp(SECRET, "abcdef", t)).toBe(false);
  });

  it("base32 round-trips", () => {
    const buf = Buffer.from("12345678901234567890");
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    expect(base32Encode(buf)).toBe(SECRET);
  });

  it("generates distinct 32-char secrets", () => {
    const a = generateTotpSecret();
    expect(a).toHaveLength(32);
    expect(a).not.toBe(generateTotpSecret());
  });
});

describe("field crypto", () => {
  it("encrypt/decrypt round-trips and produces distinct ciphertexts", () => {
    const enc1 = encryptField("secret value");
    const enc2 = encryptField("secret value");
    expect(enc1).not.toBe(enc2); // fresh IV each time
    expect(decryptField(enc1)).toBe("secret value");
    expect(decryptField(enc2)).toBe("secret value");
  });
  it("tampered ciphertext fails authentication", () => {
    const enc = encryptField("secret value");
    const tampered = enc.slice(0, -2) + (enc.endsWith("aa") ? "bb" : "aa");
    expect(() => decryptField(tampered)).toThrow();
  });
  it("token + hash helpers behave", () => {
    const t = randomToken();
    expect(t.length).toBeGreaterThan(40);
    expect(sha256(t)).toHaveLength(64);
    expect(sha256(t)).toBe(sha256(t));
  });
});
