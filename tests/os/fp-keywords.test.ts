// WP-14 · keyword opportunities: the three views are deterministic; clustering drops invented queries; add-to-brief
// writes a source. WP-27 helper: parseJsonOutput treats malformed JSON as a validation failure.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { db } from "@/lib/audit/db";
import { form, installProviderFetch, provider, signIn } from "./entry-harness";
import { AiOutputError, inventedStrings, parseJsonOutput } from "@/lib/os/ai";
import { cannibalisation, latestQueryRows, noClick, strikingDistance, validateTopics } from "@/lib/os/keywords";
import { addTopicToBriefAction, clusterKeywords } from "@/app/app/(shell)/search/keywords/actions";

process.env.LLM_API_KEY = "test-only";
const tag = `fpk-${Date.now()}`;
let orgId: string, staff: string, rep: string;
const day = new Date("2026-09-25T00:00:00.000Z");

beforeAll(async () => {
  installProviderFetch();
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", demo: true } });
  await db.cosContract.create({ data: { orgId, status: "active", services: JSON.stringify(["seo"]), modules: JSON.stringify(["search"]), signedAt: new Date(), demo: true } });
  staff = (await db.losUser.create({ data: { email: `${tag}-staff@example.com`, demo: true } })).id;
  rep = (await db.losUser.create({ data: { email: `${tag}-rep@example.com`, demo: true } })).id;
  await db.losMembership.createMany({ data: [{ orgId, userId: staff, role: "cgo_lead" }, { orgId, userId: rep, role: "sales_rep" }] });
  await db.cosSearchQuery.createMany({ data: [
    { orgId, day, query: "dentist pune", page: "https://x.test/", impressions: 900, clicks: 40, position: 4.2 },
    { orgId, day, query: "teeth whitening cost", page: "https://x.test/whitening", impressions: 300, clicks: 3, position: 11.5 },
    { orgId, day, query: "teeth whitening cost", page: "https://x.test/blog/whitening-guide", impressions: 120, clicks: 0, position: 14.0 },
    { orgId, day, query: "invisible braces price", page: "https://x.test/braces", impressions: 80, clicks: 0, position: 9.1 },
    { orgId, day, query: "dental implants", page: "https://x.test/implants", impressions: 60, clicks: 0, position: 31.0 },
    { orgId, day: new Date("2026-09-01T00:00:00.000Z"), query: "old row", page: "https://x.test/", impressions: 5, clicks: 0, position: 50 },
  ] });
});
afterAll(async () => {
  await db.cosSearchQuery.deleteMany({ where: { orgId } }); await db.cosSource.deleteMany({ where: { orgId } }); await db.cosWorkEvent.deleteMany({ where: { orgId } }); await db.cosWorkItem.deleteMany({ where: { orgId } }); await db.cosAiUsage.deleteMany({ where: { orgId } });
  await db.losAuditEvent.deleteMany({ where: { orgId } }); await db.cosContract.deleteMany({ where: { orgId } }); await db.cosWorkspace.deleteMany({ where: { orgId } });
  await db.losMembership.deleteMany({ where: { orgId } }); await db.losSession.deleteMany({ where: { userId: { in: [staff, rep] } } });
  await db.losOrg.deleteMany({ where: { id: orgId } }); await db.losUser.deleteMany({ where: { id: { in: [staff, rep] } } });
});

describe("WP-14 keyword opportunities", () => {
  it("views: latest day only, striking distance 8–20, cannibalisation, no click", async () => {
    const { rows } = await latestQueryRows(orgId);
    expect(rows).toHaveLength(5);
    expect(strikingDistance(rows).map((r) => r.query)).toEqual(["teeth whitening cost", "teeth whitening cost", "invisible braces price"]);
    const c = cannibalisation(rows);
    expect(c).toHaveLength(1); expect(c[0].query).toBe("teeth whitening cost"); expect(c[0].pages[0].page).toBe("https://x.test/whitening");
    expect(noClick(rows).map((r) => r.query)).toEqual(["teeth whitening cost", "invisible braces price", "dental implants"]);
    expect(JSON.stringify(rows)).not.toMatch(/volume/i);
  });

  it("parseJsonOutput: malformed JSON and a failed check are validation failures; inventedStrings is case-insensitive", () => {
    expect(() => parseJsonOutput("not json", () => 1)).toThrow(AiOutputError);
    expect(() => parseJsonOutput("{}", () => { throw new Error("bad shape"); })).toThrow(/bad shape/);
    expect(parseJsonOutput("```json\n{\"a\":1}\n```", (r) => (r as { a: number }).a)).toBe(1);
    expect(inventedStrings(["Dentist Pune", "made up query"], ["dentist pune"])).toEqual(["made up query"]);
  });

  it("clustering keeps only real queries and saves topics as sources; add-to-brief comments on the brief; sales rep refused", async () => {
    await signIn(staff, orgId);
    provider.llm.content = { topics: [{ name: "Whitening", intent: "commercial", queries: ["teeth whitening cost", "teeth whitening at home"] }, { name: "Nonsense", intent: "informational", queries: ["totally invented"] }] };
    const r = await clusterKeywords({}, form({}));
    expect(r.ok).toMatch(/1 topic\(s\) saved/); expect(r.ok).toMatch(/3 invented citation\(s\) dropped/);
    expect(provider.lastLlmBody).toContain("dentist pune"); expect(provider.lastLlmBody).not.toMatch(/example\.com|@/);
    const src = (await db.cosSource.findFirst({ where: { orgId, title: "Keyword topic: Whitening" } }))!;
    expect(src.excerpt).toContain("teeth whitening cost — 420 impressions, 3 clicks, best position 11.5"); expect(src.excerpt).not.toContain("at home");
    expect(validateTopics({ topics: [{ name: "X", queries: [] }] }, ["a"]).topics).toEqual([]);
    const brief = await db.cosWorkItem.create({ data: { orgId, title: "Brief: whitening", type: "content", studio: "Search", state: "backlog", demo: true } });
    expect((await addTopicToBriefAction({}, form({ topic: JSON.stringify({ name: "Whitening", intent: "commercial", queries: ["teeth whitening cost", "fake"] }), workItemId: brief.id }))).ok).toMatch(/Added/);
    expect(await db.cosWorkEvent.count({ where: { workItemId: brief.id, kind: "comment" } })).toBe(1);
    expect((await addTopicToBriefAction({}, form({ topic: JSON.stringify({ name: "Z", intent: "x", queries: ["fake"] }) }))).error).toMatch(/cites no query/);
    // a model answer of the wrong shape yields no topics (and no invented ones)
    provider.llm.content = "oops" as unknown as Record<string, unknown>;
    expect((await clusterKeywords({}, form({}))).ok).toMatch(/^0 topic/);
    await signIn(rep, orgId);
    expect((await clusterKeywords({}, form({}))).error).toBe("Forbidden.");
  });
});
