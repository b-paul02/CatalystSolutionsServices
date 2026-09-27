// WP-19 · plan → calendar → production: a calendar of four formats produces text, brief+blog, copy+image (template
// fallback: no client authorisation), and a needs_asset video item; a failed validator leaves no draft; nothing
// advances past draft. Provider boundary stubbed; the OG renderer is swapped for a tiny PNG.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { db } from "@/lib/audit/db";
import { form, installProviderFetch, provider, signIn } from "./entry-harness";
import { runPendingJobs } from "@/lib/leados/jobs";
import "@/lib/leados/registerJobs";
import { normaliseFormat, validateCalendar } from "@/lib/os/ai";
import { enqueueProduce, productionOf } from "@/lib/os/contentPipeline";
import { setTemplateRendererForTests } from "@/lib/os/graphics";
import { produceAll, produceItem } from "@/app/app/(shell)/_os/actions";

process.env.LLM_API_KEY = "test-only"; process.env.ASSET_STORAGE = "local";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==", "base64");
const tag = `fpc-${Date.now()}`;
let orgId: string, staff: string, owner: string;
const items: Record<string, string> = {};

async function contentItem(title: string, format: string) {
  const it = await db.cosWorkItem.create({ data: { orgId, title, type: "content", serviceSlug: "content", state: "backlog", riskTier: 2, payload: JSON.stringify({ channel: "linkedin", format, hook: "h", cta: "c", body: "" }), demo: true } });
  items[format] = it.id;
  return it;
}

beforeAll(async () => {
  installProviderFetch();
  setTemplateRendererForTests(async () => PNG);
  delete process.env.IMAGE_API_KEY; delete process.env.IMAGE_MODEL;
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", demo: true } });
  await db.cosContract.create({ data: { orgId, status: "active", services: JSON.stringify(["content"]), modules: JSON.stringify(["content"]), signedAt: new Date(), demo: true } });
  staff = (await db.losUser.create({ data: { email: `${tag}-staff@example.com`, demo: true } })).id;
  owner = (await db.losUser.create({ data: { email: `${tag}-owner@example.com`, demo: true } })).id;
  await db.losMembership.createMany({ data: [{ orgId, userId: staff, role: "cgo_specialist" }, { orgId, userId: owner, role: "owner" }] });
  for (const [t, f] of [["Post: why check-ups matter", "text_post"], ["Blog: teeth whitening at home", "blog"], ["Image: our new clinic", "image_post"], ["Reel: meet the hygienist", "reel"], ["Bad: guaranteed results", "email"]]) await contentItem(t, f);
});
afterAll(async () => {
  await db.losJob.deleteMany({ where: { type: "os.content_produce" } });
  await db.cosAssetVersion.deleteMany({ where: { orgId } }); await db.cosAsset.deleteMany({ where: { orgId } }); await db.cosWorkEvent.deleteMany({ where: { orgId } }); await db.cosRevision.deleteMany({ where: { orgId } }); await db.cosWorkItem.deleteMany({ where: { orgId } });
  await db.cosAiUsage.deleteMany({ where: { orgId } }); await db.cosNotification.deleteMany({ where: { orgId } }); await db.losAuditEvent.deleteMany({ where: { orgId } });
  await db.cosContract.deleteMany({ where: { orgId } }); await db.cosWorkspace.deleteMany({ where: { orgId } }); await db.losMembership.deleteMany({ where: { orgId } }); await db.losSession.deleteMany({ where: { userId: { in: [staff, owner] } } });
  await db.losOrg.deleteMany({ where: { id: orgId } }); await db.losUser.deleteMany({ where: { id: { in: [staff, owner] } } });
});
beforeEach(() => { provider.llm = { content: { body: "A plain draft about check-ups. Book yours today.", meta: { title: "t", description: "d" }, expertiseFlags: [] }, status: 200, outputTokens: 120, timeout: false, gate: null }; });

describe("WP-19 content pipeline", () => {
  it("format is an enum with aliases; unknown formats are dropped by the calendar validator", () => {
    expect(normaliseFormat("LinkedIn post")).toBe("text_post"); expect(normaliseFormat("Reels")).toBe("reel"); expect(normaliseFormat("image_post")).toBe("image_post"); expect(normaliseFormat("hologram")).toBeNull();
    const v = validateCalendar([{ dayOffset: 0, channel: "linkedin", topic: "A", format: "article" }, { dayOffset: 1, channel: "linkedin", topic: "B", format: "hologram" }], ["linkedin"], 14);
    expect(v.items.map((i) => i.format)).toEqual(["blog"]); expect(v.dropped).toEqual(['format "hologram"']);
  });

  it("produce all: text, brief+blog, copy+template image, needs_asset video; a banned claim leaves no draft; clients cannot produce", async () => {
    await signIn(owner, orgId);
    expect((await produceItem({}, form({ id: items.text_post }))).error).toBe("Forbidden.");
    await signIn(staff, orgId);
    const r = await produceAll({}, form({}));
    expect(r.ok).toMatch(/5 item\(s\) queued · 1 image\(s\)/);
    // the email item's draft will contain a banned claim
    let guard = 0;
    for (;;) {
      const pending = await db.losJob.findMany({ where: { type: "os.content_produce", status: "pending" }, select: { payload: true } });
      if (!pending.length || guard++ > 10) break;
      const next = JSON.parse(pending[0].payload!) as { itemId: string };
      provider.llm.content = next.itemId === items.email ? { body: "We guarantee first page on Google in 30 days.", meta: {}, expertiseFlags: [] }
        : next.itemId === items.image_post ? { body: "Caption: welcome to the new clinic.\nImage: A calmer visit starts here — soft light, no rush", meta: {}, expertiseFlags: [] }
        : next.itemId === items.reel ? { body: "0:00 Hi, I am Meera.\nSHOT LIST\nShot 1 — close — smile — 'Meet Meera'\nCAPTION\nMeet the person behind your smile.", meta: {}, expertiseFlags: [] }
        : { body: "A plain draft about check-ups. Book yours today.", meta: { title: "t", description: "d" }, expertiseFlags: [] };
      await runPendingJobs(1);
    }
    const get = async (f: string) => { const it = await db.cosWorkItem.findUniqueOrThrow({ where: { id: items[f] } }); return { it, p: JSON.parse(it.payload!) as Record<string, unknown>, prod: productionOf(it.payload)! }; };
    const text = await get("text_post"); expect(text.prod.status).toBe("draft_ready"); expect(text.p.body).toContain("plain draft"); expect(text.it.state).toBe("backlog");
    const blog = await get("blog"); expect(blog.prod.status).toBe("draft_ready"); expect(blog.p.brief).toBeTruthy(); expect(String(blog.p.body)).toContain("plain draft");
    const img = await get("image_post"); expect(img.prod.status).toBe("draft_ready"); expect(img.prod.imageSource).toBe("template"); expect((img.p.mediaAssetIds as string[]).length).toBe(1); expect(img.prod.note).toMatch(/No client authorisation/);
    const asset = await db.cosAsset.findUniqueOrThrow({ where: { id: (img.p.mediaAssetIds as string[])[0] } }); expect(asset.origin).toBe("ai_generated"); expect(asset.sourceNote).toMatch(/built-in graphic template/);
    const reel = await get("reel"); expect(reel.prod.status).toBe("needs_asset"); expect(String(reel.p.body)).toContain("SHOT LIST"); expect(reel.p.scriptOnly).toBe(true);
    expect(await db.cosNotification.count({ where: { orgId, kind: "asset_needed" } })).toBe(1);
    const bad = await get("email"); expect(bad.prod.status).toBe("failed"); expect(bad.prod.reason).toMatch(/Validators rejected/); expect(bad.p.body).toBe("");
    expect(await db.cosWorkEvent.count({ where: { orgId, workItemId: items.email, kind: "ai" } })).toBe(1);
    // images never used the provider or the client's wallet
    expect(provider.imageCalls).toBe(0); expect(await db.cosCreditLedger.count({ where: { orgId } })).toBe(0);
    // a second produce of the same version is idempotent; a new version can be produced again
    expect(await enqueueProduce({ orgId, userId: staff, role: "cgo_specialist" }, items.text_post)).toEqual({ queued: true });
    expect(await db.losJob.count({ where: { idempotencyKey: `item:${items.text_post}:1` } })).toBe(1);
    expect(await db.cosNotification.count({ where: { orgId, kind: "draft_ready" } })).toBe(3);
  });
});
