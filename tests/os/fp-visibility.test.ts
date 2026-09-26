// WP-20 preview limits (pure) + drag-day arithmetic · WP-24 IndexNow submission + tracked positions from Search Console rows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { db } from "@/lib/audit/db";
import { form, signIn } from "./entry-harness";
import { previewLimits } from "@/components/os/ChannelPreview";
import { formatSpec } from "@/lib/os/channels";
import { addTrackedKeyword, submitIndexNow, syncTrackedPositions, tickTrackedPositions, trackedPositions } from "@/lib/os/indexnow";
import { keywordAdd } from "@/app/app/(shell)/search/keywords/actions";
import { utcToZonedInput } from "@/lib/os/time";

const tag = `fpv-${Date.now()}`;
let orgId: string, staff: string;
const posted: { url: string; body: string }[] = [];

beforeAll(async () => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); if (url === "https://api.indexnow.org/indexnow") { posted.push({ url, body: String(init?.body) }); return new Response("", { status: 202 }); } throw new Error(`Unexpected outbound request in a test: ${url}`); });
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", demo: true } });
  staff = (await db.losUser.create({ data: { email: `${tag}-staff@example.com`, demo: true } })).id;
  await db.losMembership.create({ data: { orgId, userId: staff, role: "cgo_lead" } });
  const day = new Date("2026-09-25T00:00:00.000Z");
  await db.cosSearchQuery.createMany({ data: [
    { orgId, day, query: "dentist pune", page: "https://x.test/", impressions: 900, clicks: 40, position: 4.0 },
    { orgId, day, query: "dentist pune", page: "https://x.test/about", impressions: 100, clicks: 1, position: 14.0 },
    { orgId, day, query: "braces cost", page: "https://x.test/braces", impressions: 0, clicks: 0, position: 30 },
  ] });
});
afterAll(async () => {
  await db.cosSearchQuery.deleteMany({ where: { orgId } }); await db.cosTrackedKeyword.deleteMany({ where: { orgId } }); await db.cosMetricSnapshot.deleteMany({ where: { orgId } });
  await db.cosHeartbeat.deleteMany({ where: { key: { startsWith: `os.positions:${orgId}` } } }); await db.losAuditEvent.deleteMany({ where: { orgId } });
  await db.cosWorkspace.deleteMany({ where: { orgId } }); await db.losMembership.deleteMany({ where: { orgId } }); await db.losSession.deleteMany({ where: { userId: staff } });
  await db.losOrg.deleteMany({ where: { id: orgId } }); await db.losUser.deleteMany({ where: { id: staff } });
  delete process.env.INDEXNOW_KEY;
  vi.unstubAllGlobals();
});

describe("WP-20 preview + drag", () => {
  it("limits come from the format spec: characters, thread posts, title, media count", () => {
    const x = previewLimits({ channel: "x", format: "post", title: null, body: "a".repeat(300), parts: [], cta: null, link: null, media: [] }, formatSpec("x", "post"));
    expect(x.find((l) => l.label === "characters")).toMatchObject({ used: 300, max: 280, ok: false });
    const th = previewLimits({ channel: "x", format: "thread", title: null, body: "", parts: ["one", "b".repeat(281)], cta: null, link: null, media: [] }, formatSpec("x", "thread"));
    expect(th.find((l) => l.label === "posts")).toMatchObject({ used: 2, ok: true }); expect(th.find((l) => l.label === "longest post")).toMatchObject({ used: 281, ok: false });
    const yt = previewLimits({ channel: "youtube", format: "short", title: "", body: "x", parts: [], cta: null, link: null, media: [] }, formatSpec("youtube", "short"));
    expect(yt.find((l) => l.label === "title")).toMatchObject({ used: 0, ok: false }); expect(yt.find((l) => l.label === "video files")).toMatchObject({ used: 0, ok: false });
    expect(previewLimits({ channel: "x", format: "post", title: null, body: "", parts: [], cta: null, link: null, media: [] }, null)).toEqual([]);
  });
  it("drag keeps the local time of day in the publication's zone", () => {
    const at = new Date("2026-10-05T04:30:00.000Z"); // 10:00 IST
    expect(`2026-10-12T${utcToZonedInput(at, "Asia/Kolkata").slice(11, 16)}`).toBe("2026-10-12T10:00");
  });
});

describe("WP-24 IndexNow + positions", () => {
  it("submits with the host's key location only when a key is set; failure never throws", async () => {
    delete process.env.INDEXNOW_KEY;
    expect(await submitIndexNow(orgId, "https://blog.test/post-1")).toMatchObject({ submitted: false, reason: "INDEXNOW_KEY not set" });
    process.env.INDEXNOW_KEY = "abc123key";
    expect(await submitIndexNow(orgId, "https://blog.test/post-1")).toMatchObject({ submitted: true, status: 202 });
    expect(JSON.parse(posted[0].body)).toEqual({ host: "blog.test", key: "abc123key", keyLocation: "https://blog.test/abc123key.txt", urlList: ["https://blog.test/post-1"] });
    expect(await submitIndexNow(orgId, "not a url")).toMatchObject({ submitted: false });
  });
  it("tracked phrases read impression-weighted positions from the latest rows; no rows ⇒ absent; weekly tick runs once", async () => {
    await signIn(staff, orgId);
    expect((await keywordAdd({}, form({ query: "Dentist Pune" }))).ok).toMatch(/Tracked/);
    await addTrackedKeyword({ orgId, userId: staff, role: "cgo_lead" }, "braces cost");
    await addTrackedKeyword({ orgId, userId: staff, role: "cgo_lead" }, "unknown phrase");
    expect(await syncTrackedPositions(orgId)).toEqual({ tracked: 3, measured: 1 });
    const t = await trackedPositions(orgId);
    expect(t.find((x) => x.query === "dentist pune")).toMatchObject({ position: 5, impressions: 1000 }); // (4×900 + 14×100) / 1000
    expect(t.find((x) => x.query === "braces cost")!.position).toBeNull(); expect(t.find((x) => x.query === "unknown phrase")!.position).toBeNull();
    const rows = await db.cosMetricSnapshot.findMany({ where: { orgId, metric: "search.position" } });
    expect(rows).toHaveLength(1); expect(rows[0].kind).toBe("lifetime");
    await tickTrackedPositions(); await tickTrackedPositions();
    expect(await db.cosHeartbeat.count({ where: { key: { startsWith: `os.positions:${orgId}` } } })).toBe(1);
    await expect(addTrackedKeyword({ orgId, userId: staff, role: "cgo_lead" }, "x")).rejects.toThrow(/search phrase/);
  });
});
