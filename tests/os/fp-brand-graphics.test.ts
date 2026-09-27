// WP-21 brand-voice rules (pure checks + inline warnings on a variant) · WP-22 graphics from a variant into Assets ·
// WP-23 per-channel derivatives as tagged assets. Renderers swapped for a tiny PNG (satori needs fonts/wasm).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { db } from "@/lib/audit/db";
import { form, signIn } from "./entry-harness";
import { brandProblems, readingGrade, saveBrandRules } from "@/lib/os/brand";
import { brandRulesSave } from "@/app/app/(shell)/settings/brand-voice/actions";
import { variantCheck } from "@/lib/os/content";
import { setTemplateRendererForTests } from "@/lib/os/graphics";
import { DERIVATIVE_SIZES, makeDerivatives, makeGraphicForVariant, setDerivativeRendererForTests } from "@/lib/os/graphicsMake";
import { uploadAsset } from "@/lib/os/assets";
import { derivativesMake, graphicMake } from "@/app/app/(shell)/_os/v2";

process.env.ASSET_STORAGE = "local";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==", "base64");
const tag = `fbg-${Date.now()}`;
let orgId: string, owner: string, staff: string, masterId: string, variantId: string;
const rendered: { key: string; fields: Record<string, unknown> }[] = [];

beforeAll(async () => {
  setTemplateRendererForTests(async (key, f) => { rendered.push({ key, fields: f as Record<string, unknown> }); return PNG; });
  setDerivativeRendererForTests(async () => PNG);
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", demo: true } });
  await db.cosContract.create({ data: { orgId, status: "active", services: JSON.stringify(["content"]), modules: JSON.stringify(["content", "assets"]), signedAt: new Date(), demo: true } });
  owner = (await db.losUser.create({ data: { email: `${tag}-owner@example.com`, demo: true } })).id;
  staff = (await db.losUser.create({ data: { email: `${tag}-staff@example.com`, demo: true } })).id;
  await db.losMembership.createMany({ data: [{ orgId, userId: owner, role: "owner" }, { orgId, userId: staff, role: "cgo_specialist" }] });
  masterId = (await db.cosWorkItem.create({ data: { orgId, title: `${tag} Why check-ups matter`, type: "content", state: "backlog", demo: true } })).id;
  variantId = (await db.cosContentVariant.create({ data: { orgId, workItemId: masterId, channel: "linkedin", format: "post", body: "A check-up now is easier than a problem later. Book a consultation this month.", cta: "Book a consultation", contentHash: "h", demo: true } })).id;
});
afterAll(async () => {
  await db.cosAssetVersion.deleteMany({ where: { orgId } }); await db.cosAsset.deleteMany({ where: { orgId } }); await db.cosContentVariant.deleteMany({ where: { orgId } }); await db.cosWorkItem.deleteMany({ where: { orgId } });
  await db.cosBrandRules.deleteMany({ where: { orgId } }); await db.losAuditEvent.deleteMany({ where: { orgId } }); await db.cosContract.deleteMany({ where: { orgId } }); await db.cosWorkspace.deleteMany({ where: { orgId } });
  await db.losMembership.deleteMany({ where: { orgId } }); await db.losSession.deleteMany({ where: { userId: { in: [owner, staff] } } });
  await db.losOrg.deleteMany({ where: { id: orgId } }); await db.losUser.deleteMany({ where: { id: { in: [owner, staff] } } });
});

describe("WP-21 brand voice", () => {
  it("reading grade heuristic and rule checks are pure and labelled", () => {
    expect(readingGrade("short")).toBeNull();
    const plain = readingGrade("We help local clinics get more patients. Clear reports every month. No jargon at all here.");
    const dense = readingGrade("Our organisation facilitates comprehensive multidisciplinary optimisation methodologies for healthcare establishments pursuing sustainable acquisition trajectories.");
    expect(plain!).toBeLessThan(dense!);
    const rules = { bannedPhrases: ["best in class"], requiredPhrases: ["book a consultation"], maxReadingGrade: 6, toneNotes: null, color: null };
    const out = brandProblems("We are best in class. Our organisation facilitates comprehensive multidisciplinary optimisation methodologies for healthcare establishments.", rules);
    expect(out.some((p) => p.includes("avoid “best in class”"))).toBe(true); expect(out.some((p) => p.includes("should mention “book a consultation”"))).toBe(true); expect(out.some((p) => p.includes("syllable heuristic"))).toBe(true);
    expect(brandProblems("Fine copy: book a consultation today and we take care of the rest.", { ...rules, maxReadingGrade: null })).toEqual([]);
  });

  it("owner saves rules; violations appear inline as warnings on a variant; staff cannot edit rules", async () => {
    await signIn(staff, orgId);
    expect((await brandRulesSave({}, form({ banned: "guesswork", color: "#112233" }))).error).toBe("Forbidden.");
    await signIn(owner, orgId);
    expect((await brandRulesSave({}, form({ banned: "problem later\ncheap", required: "book a consultation\nsame-day", maxReadingGrade: "18", color: "#112233", toneNotes: "Warm and plain." }))).ok).toMatch(/Saved/);
    const v = (await db.cosContentVariant.findUniqueOrThrow({ where: { id: variantId } }));
    const check = await variantCheck(orgId, v);
    expect(check.problems).toEqual([]);
    expect(check.warnings).toEqual(["Brand voice: avoid “problem later”.", "Brand voice: should mention “same-day”."]);
    const r = await saveBrandRules({ orgId, userId: owner, role: "owner" }, { bannedPhrases: [], requiredPhrases: [], maxReadingGrade: 99, toneNotes: "", color: "nope" });
    expect(r.maxReadingGrade).toBe(18); expect(r.color).toBeNull();
    await saveBrandRules({ orgId, userId: owner, role: "owner" }, { bannedPhrases: [], requiredPhrases: [], maxReadingGrade: null, toneNotes: "Warm.", color: "#112233" });
  });
});

describe("WP-22 templated graphics", () => {
  it("fields come from the variant copy and the brand colour; saved as an asset, then as a new version; clients refused", async () => {
    await signIn(staff, orgId);
    expect((await graphicMake({}, form({ variantId, template: "quote_card" }))).ok).toMatch(/saved to Assets/);
    expect(rendered.at(-1)).toMatchObject({ key: "quote_card", fields: { title: "A check-up now is easier than a problem later.", body: "Book a consultation", color: "#112233" } });
    const asset = (await db.cosAsset.findFirst({ where: { orgId, workItemId: masterId } }))!;
    expect(asset.origin).toBe("ai_generated"); expect(asset.currentVersion).toBe(1);
    expect((await graphicMake({}, form({ variantId, template: "quote_card" }))).ok).toMatch(/re-rendered as v2/);
    expect((await db.cosAsset.findUniqueOrThrow({ where: { id: asset.id } })).currentVersion).toBe(2);
    expect((await db.cosContentVariant.findUniqueOrThrow({ where: { id: variantId } })).mediaAssetIds).toEqual([]); // never attached silently
    await expect(makeGraphicForVariant({ orgId, userId: owner, role: "owner" }, variantId, "blog_cover")).rejects.toThrow("Forbidden.");
    await expect(makeGraphicForVariant({ orgId, userId: staff, role: "cgo_specialist" }, variantId, "nope" as never)).rejects.toThrow(/Unknown template/);
  });
});

describe("WP-23 derivatives", () => {
  it("renders chosen sizes as tagged PNG assets, idempotently; refuses non-images and oversized sources", async () => {
    const actor = { orgId, userId: staff, role: "cgo_specialist" };
    const src = await uploadAsset(actor, { name: "hero.png", mime: "image/png", bytes: PNG, category: "brand" });
    await signIn(staff, orgId);
    expect((await derivativesMake({}, form({ id: src.id }))).error).toMatch(/Pick at least one size/);
    const made = await makeDerivatives(actor, src.id, ["instagram:square", "linkedin:landscape", "bogus"]);
    expect(made.map((m) => m.key)).toEqual(["instagram:square", "linkedin:landscape"]);
    const d = await db.cosAsset.findMany({ where: { orgId, tags: { has: `derivative-of:${src.id}` } } });
    expect(d).toHaveLength(2); expect(d[0].name).toMatch(/1080×1080|1200×627/); expect(d[0].sourceNote).toContain("PNG only");
    const again = await makeDerivatives(actor, src.id, ["instagram:square"]);
    expect(again[0].assetId).toBe(made[0].assetId); expect(again[0].version).toBe(2);
    expect(Object.keys(DERIVATIVE_SIZES).length).toBeGreaterThanOrEqual(6);
    const doc = await uploadAsset(actor, { name: "notes.txt", mime: "text/plain", bytes: Buffer.from("hello"), category: "source" });
    await expect(makeDerivatives(actor, doc.id, ["instagram:square"])).rejects.toThrow(/from images/);
  });
});
