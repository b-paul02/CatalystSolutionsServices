// GrowthOS v2 — pure rules (no database, no network).
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertSafeDatabase, isLocalDb, pinTestDatabase } from "@/lib/dbGuard";
import { decryptField, encryptField, needsReencrypt } from "@/lib/leados/crypto";
import { formatInZone, periodBounds, utcToZonedInput, zonedToUtc } from "@/lib/os/time";
import { copyFingerprint, taggedUrl, validateVariant, variantHash } from "@/lib/os/channels";
import { verifyStripeSignature, toMinor } from "@/lib/os/commercial";
import { canMoveEngagement, cyclePeriod, derivePaymentStatus } from "@/lib/os/engagement";
import { templateProblems, TEMPLATES } from "@/lib/os/templates";
import { SERVICES } from "@/lib/os/catalog";
import { inventedNumbers, unsupportedClaims } from "@/lib/os/ai";
import { dimKeyOf, METRICS } from "@/lib/os/metrics";
import { adapterFor } from "@/lib/os/adapters";

describe("database guard fails closed", () => {
  it("tests may only use a local *_test database; anything else is replaced by an unreachable sentinel", () => {
    for (const bad of [undefined, "postgresql://u:p@ep-cool.eu-central-1.aws.neon.tech/neondb", "postgresql://u@localhost:5432/growthos_dev"]) {
      const env = { TEST_DATABASE_URL: bad, DATABASE_URL: "postgresql://u:p@prod.example.com/prod" } as unknown as NodeJS.ProcessEnv;
      expect(pinTestDatabase(env).ok).toBe(false);
      expect(env.DATABASE_URL).toContain("db-blocked.invalid");
    }
    const env = { TEST_DATABASE_URL: "postgresql://u@localhost:54329/growthos_test" } as unknown as NodeJS.ProcessEnv;
    expect(pinTestDatabase(env).ok).toBe(true);
    expect(env.DATABASE_URL).toBe(env.TEST_DATABASE_URL);
  });
  it("dev and scripts refuse a remote database; production is untouched", () => {
    expect(() => assertSafeDatabase({ NODE_ENV: "development", DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/db" } as NodeJS.ProcessEnv)).toThrow("non-local");
    expect(() => assertSafeDatabase({ NODE_ENV: "development", DATABASE_URL: "postgresql://u@127.0.0.1:54329/growthos_dev" } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => assertSafeDatabase({ NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/db" } as NodeJS.ProcessEnv)).not.toThrow();
    expect(isLocalDb("not a url")).toBe(false);
  });
});

describe("field encryption keys", () => {
  it("writes versioned ciphertext, still reads legacy values under the key that wrote them, and has no public fallback", () => {
    const saved = { ...process.env };
    try {
      process.env.LEADOS_SECRET = "current-key";
      const v2 = encryptField("token-abc");
      expect(v2.startsWith("k2.")).toBe(true);
      expect(needsReencrypt(v2)).toBe(false);
      expect(decryptField(v2)).toBe("token-abc");
      // a legacy (3-part) value written under the old ADMIN_SESSION_SECRET fallback stays readable
      process.env.ADMIN_SESSION_SECRET = "old-session-secret";
      process.env.LEADOS_SECRET = "old-session-secret";
      const legacy = encryptField("legacy-token").slice(3);
      process.env.LEADOS_SECRET = "current-key";
      expect(needsReencrypt(legacy)).toBe(true);
      expect(decryptField(legacy)).toBe("legacy-token");
      // no key configured → refuse, never "dev-secret"
      delete process.env.LEADOS_SECRET; delete process.env.ADMIN_SESSION_SECRET; delete process.env.LEADOS_LEGACY_SECRET;
      expect(() => encryptField("x")).toThrow("LEADOS_SECRET");
      expect(() => decryptField(legacy)).toThrow();
    } finally { process.env = saved; }
  });
});

describe("workspace time", () => {
  it("converts wall time to UTC across DST and reports gaps and overlaps", () => {
    expect(zonedToUtc("2026-07-01T09:00", "America/New_York").utc.toISOString()).toBe("2026-07-01T13:00:00.000Z"); // EDT
    expect(zonedToUtc("2026-12-01T09:00", "America/New_York").utc.toISOString()).toBe("2026-12-01T14:00:00.000Z"); // EST
    expect(zonedToUtc("2026-07-01T09:00", "Asia/Kolkata").utc.toISOString()).toBe("2026-07-01T03:30:00.000Z"); // half-hour zone
    const gap = zonedToUtc("2026-03-08T02:30", "America/New_York"); // clocks jump 02:00 → 03:00
    expect(gap.note).toBe("gap_shifted_forward");
    expect(gap.utc.toISOString()).toBe("2026-03-08T07:30:00.000Z");
    const twice = zonedToUtc("2026-11-01T01:30", "America/New_York"); // 01:30 happens twice
    expect(twice.note).toBe("ambiguous_first_used");
    expect(twice.utc.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(() => zonedToUtc("2026-07-01T09:00", "Mars/Olympus")).toThrow("time zone");
  });
  it("round-trips for display and builds period bounds in the workspace zone", () => {
    const at = new Date("2026-11-01T05:30:00.000Z");
    expect(utcToZonedInput(at, "America/New_York")).toBe("2026-11-01T01:30");
    expect(formatInZone(at, "Asia/Kolkata", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })).toBe("11:00");
    const m = periodBounds("month", "Asia/Kolkata", new Date("2026-09-30T20:00:00.000Z")); // already 1 Oct in India
    expect(m.start.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(m.end.toISOString()).toBe("2026-10-31T18:30:00.000Z");
  });
});

describe("channel rules", () => {
  const base = { title: null, body: "Hello", parts: [] as string[], cta: null, destinationUrl: null, mediaAssetIds: [] as string[] };
  it("enforces per-format limits and never treats a script as a video", () => {
    expect(validateVariant("x", "post", { ...base, body: "a".repeat(281) }, []).problems[0]).toContain("280");
    expect(validateVariant("x", "post", { ...base, body: `${"a".repeat(250)} https://example.com/${"p".repeat(80)}` }, []).problems).toEqual([]); // links count as 23
    expect(validateVariant("x", "thread", { ...base, parts: ["only one"] }, []).problems[0]).toContain("at least 2");
    expect(validateVariant("youtube", "short", { ...base, title: "Tip", body: "Full script here" }, []).problems.join(" ")).toContain("not a video");
    expect(validateVariant("youtube", "short", { ...base, title: "Tip", mediaAssetIds: ["a1"] }, [{ id: "a1", kind: "video", status: "approved", durationSec: 400 }]).problems.join(" ")).toContain("180s");
    expect(validateVariant("instagram", "carousel", { ...base, mediaAssetIds: ["a1"] }, [{ id: "a1", kind: "image", status: "approved" }]).problems.join(" ")).toContain("at least 2");
    expect(validateVariant("linkedin", "reel", base, []).problems[0]).toContain("does not support");
    expect(validateVariant("instagram", "post", { ...base, destinationUrl: "https://ex.com", mediaAssetIds: ["a1"] }, [{ id: "a1", kind: "image", status: "draft" }]).warnings.length).toBe(2);
  });
  it("hash covers copy, media, CTA and destination — and nothing else", () => {
    const h = variantHash(base);
    expect(variantHash({ ...base, body: "Hello " })).toBe(h); // whitespace is not material
    for (const change of [{ body: "Hello!" }, { cta: "Book" }, { destinationUrl: "https://ex.com" }, { mediaAssetIds: ["a"] }, { parts: ["x"] }, { title: "T" }]) expect(variantHash({ ...base, ...change })).not.toBe(h);
  });
  it("tags links from stable ids and replaces any existing utm", () => {
    const u = new URL(taggedUrl("https://ex.com/offer?utm_campaign=old&ref=1", { campaignCode: "spring-launch", channel: "linkedin", variantId: "var_1" }));
    expect(Object.fromEntries(u.searchParams)).toEqual({ ref: "1", utm_source: "linkedin", utm_medium: "social", utm_campaign: "spring-launch", utm_content: "var_1" });
    expect(new URL(taggedUrl("https://ex.com", { campaignCode: "c", channel: "youtube", variantId: "v", paid: true })).searchParams.get("utm_medium")).toBe("paid_video");
    expect(copyFingerprint("Book your FREE consult today!  https://a.co/x")).toBe(copyFingerprint("book your free consult today https://b.co/y"));
  });
  it("no adapter pretends: unknown pairs have none, the test adapter is off unless explicitly enabled", () => {
    expect(adapterFor("linkedin", "instagram")).toBeNull();
    const saved = process.env.GROWTHOS_TEST_ADAPTER;
    delete process.env.GROWTHOS_TEST_ADAPTER;
    expect(adapterFor("test", "x")).toBeNull();
    process.env.GROWTHOS_TEST_ADAPTER = saved;
  });
});

describe("payments", () => {
  const secret = "whsec_test", body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" }), now = 1_800_000_000_000;
  const sign = (t: number, s = secret) => `t=${t},v1=${createHmac("sha256", s).update(`${t}.${body}`).digest("hex")}`;
  it("verifies Stripe signatures: wrong secret, altered body, replay and missing secret all fail", () => {
    const t = now / 1000;
    expect(verifyStripeSignature(body, sign(t), secret, now)).toBe(true);
    expect(verifyStripeSignature(body, sign(t, "other"), secret, now)).toBe(false);
    expect(verifyStripeSignature(`${body} `, sign(t), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(t - 301), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(t), undefined, now)).toBe(false);
    expect(verifyStripeSignature(body, null, secret, now)).toBe(false);
  });
  it("money is integer minor units", () => {
    expect(toMinor("1,250.50")).toBe(125050n);
    expect(toMinor(99)).toBe(9900n);
    expect(() => toMinor("12.345")).toThrow();
    expect(() => toMinor("-5")).toThrow();
  });
  it("payment status is derived from records, separately from delivery stage", () => {
    const due = new Date("2026-01-01"), now2 = new Date("2026-02-01");
    expect(derivePaymentStatus([])).toBe("not_invoiced");
    expect(derivePaymentStatus([{ status: "draft", dueAt: null }])).toBe("not_invoiced");
    expect(derivePaymentStatus([{ status: "issued", dueAt: null }])).toBe("invoiced");
    expect(derivePaymentStatus([{ status: "issued", dueAt: due }], now2)).toBe("overdue");
    expect(derivePaymentStatus([{ status: "paid", dueAt: due }, { status: "issued", dueAt: null }], now2)).toBe("part_paid");
    expect(derivePaymentStatus([{ status: "paid", dueAt: due }, { status: "void", dueAt: due }], now2)).toBe("paid");
  });
});

describe("engagement rules", () => {
  it("only the client's signature accepts an engagement; staff cannot", () => {
    expect(canMoveEngagement("proposal", "accepted", "staff").ok).toBe(false);
    expect(canMoveEngagement("proposal", "accepted", "client_signature").ok).toBe(true);
    expect(canMoveEngagement("accepted", "onboarding", "staff").ok).toBe(true);
    expect(canMoveEngagement("onboarding", "completed", "staff").ok).toBe(false);
    expect(canMoveEngagement("offboarded", "active", "staff").ok).toBe(false);
  });
  it("cycle periods are stable boundaries", () => {
    const anchor = new Date("2026-01-31T10:00:00Z");
    expect(cyclePeriod("none", anchor, new Date())).toBeNull();
    const p = cyclePeriod("monthly", anchor, new Date("2026-03-15T00:00:00Z"))!;
    expect([p.start.toISOString().slice(0, 10), p.end.toISOString().slice(0, 10)]).toEqual(["2026-02-28", "2026-03-28"]);
    const q = cyclePeriod("quarterly", new Date("2026-01-05T00:00:00Z"), new Date("2026-08-01T00:00:00Z"))!;
    expect(q.start.toISOString().slice(0, 10)).toBe("2026-07-05");
  });
});

describe("service templates", () => {
  it("every service has a complete, internally consistent template", () => {
    expect(templateProblems()).toEqual([]);
    expect(Object.keys(TEMPLATES).sort()).toEqual(SERVICES.map((s) => s.slug).sort());
    for (const t of Object.values(TEMPLATES)) expect(t.intake.length).toBeGreaterThan(0);
    expect(TEMPLATES.website.milestones.launch.after).toContain("acceptance");
    expect(TEMPLATES.video.milestones.script.acceptance).toContain("not a video");
  });
});

describe("AI output checks", () => {
  it("flags claims that no approved claim or source supports", () => {
    const grounding = "We have served 1200 patients since 2015.";
    expect(unsupportedClaims("We have served 1200 patients. We are the #1 clinic. Results improve by 40%.", grounding)).toEqual(["We are the #1 clinic.", "Results improve by 40%."]);
  });
  it("rejects narratives containing numbers that are not in the facts", () => {
    const facts = { "Website sessions": 1840, "Enquiries": 12, "Recorded sales (INR)": "4,50,000.00", "Watch time": null };
    expect(inventedNumbers("Sessions reached 1840 with 12 enquiries worth 450000.00.", facts)).toEqual([]);
    expect(inventedNumbers("Sessions grew 35% to 1840.", facts)).toEqual(["35"]);
  });
});

describe("metrics", () => {
  it("dimension keys separate org, account, campaign and publication; reach is never additive", () => {
    expect(dimKeyOf({})).toBe("org");
    expect(dimKeyOf({ connectionId: "c1" })).toBe("acct:c1");
    expect(dimKeyOf({ campaignId: "k1", connectionId: "c1" })).toBe("camp:k1");
    expect(dimKeyOf({ publicationId: "p1", campaignId: "k1" })).toBe("pub:p1");
    expect(METRICS.reach.additive).toBe(false);
    expect(METRICS.clicks.definition).toContain("Not website sessions");
  });
});
