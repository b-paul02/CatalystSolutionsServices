// Delivery-side behaviour through the entry points a person or a scheduler actually hits: server actions, PAGE
// components (for denial), and route handlers. Framework + provider boundaries only are replaced (entry-harness.ts).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => { throw new Error("no request scope"); } }));

import { db } from "@/lib/audit/db";
import { follow, form, signIn, signOut } from "./entry-harness";
import { signContract } from "@/app/app/(shell)/_os/actions";
import { handover as engagementHandOver } from "@/app/app/(shell)/_os/v2";
import { studioQuote } from "@/app/app/(shell)/_os/studio";
import LeadsPage from "@/app/app/(shell)/leads/page";
import OpsPage from "@/app/app/(shell)/ops/page";
import StudioPage from "@/app/app/(shell)/studio/page";
import { POST as uploadRoute } from "@/app/api/os/assets/route";
import { GET as tickRoute } from "@/app/api/os/tick/route";
import { GET as exportRoute } from "@/app/api/os/export/route";
import { GET as mediaRoute } from "@/app/api/os/media/[versionId]/route";
import { entitlements } from "@/lib/os/entitlements";
import { createEngagement } from "@/lib/os/engagement";
import { runTick } from "@/lib/os/tick";
import { mediaLink } from "@/lib/os/storage";

process.env.ASSET_STORAGE = "local"; process.env.CRON_SECRET = "test-cron-secret"; process.env.LLM_API_KEY = "test-only";

const tag = `ce-${Date.now()}`;
let withCrm: string, noCrm: string, engagementId: string, contractId: string;
const U: Record<string, string> = {};
const user = async (n: string) => (U[n] = (await db.losUser.create({ data: { email: `${tag}-${n}@example.com`, name: n, demo: true } })).id);
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001", "hex");

beforeAll(async () => {
  withCrm = (await db.losOrg.create({ data: { name: `${tag}-crm`, demo: true } })).id;
  noCrm = (await db.losOrg.create({ data: { name: `${tag}-nocrm`, demo: true } })).id;
  await db.cosWorkspace.createMany({ data: [{ orgId: withCrm, kind: "client", demo: true }, { orgId: noCrm, kind: "prospect", demo: true }] });
  await db.cosContract.create({ data: { orgId: withCrm, status: "active", services: "[]", modules: JSON.stringify(["crm"]), signedAt: new Date(), demo: true } });
  await user("owner"); await user("admin"); await user("staff");
  for (const org of [withCrm, noCrm]) await db.losMembership.create({ data: { orgId: org, userId: U.owner, role: "owner" } }); // one person, two workspaces
  await db.losMembership.create({ data: { orgId: noCrm, userId: U.admin, role: "admin" } });
  await db.losMembership.create({ data: { orgId: noCrm, userId: U.staff, role: "cgo_lead" } });
  // Catalyst provisions: engagement + proposed scope with services AND tool entitlements (fixture = what the admin action writes)
  engagementId = (await createEngagement(noCrm, null, { name: `${tag} engagement`, entrySource: "direct", demo: true }, "platform_admin")).id;
  await db.cosEngagement.update({ where: { id: engagementId }, data: { stage: "proposal" } });
  contractId = (await db.cosContract.create({ data: { orgId: noCrm, engagementId, status: "proposed", services: JSON.stringify(["content"]), modules: JSON.stringify(["content"]), aiTools: JSON.stringify(["linkedin_post"]), allowances: JSON.stringify({ aiCredits: 500, includedAiCredits: 40, includedAiCreditsExpireDays: 30 }), demo: true } })).id;
});

afterAll(async () => {
  const orgs = [withCrm, noCrm];
  await db.cosWorkItem.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losAuditEvent.deleteMany({ where: { orgId: { in: orgs } } });
  await db.cosContract.deleteMany({ where: { orgId: { in: orgs } } });
  await db.cosWorkspace.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losMembership.deleteMany({ where: { orgId: { in: orgs } } });
  await db.losSession.deleteMany({ where: { userId: { in: Object.values(U) } } });
  await db.losOrg.deleteMany({ where: { id: { in: orgs } } });
  await db.losUser.deleteMany({ where: { id: { in: Object.values(U) } } });
});

describe("expected refusals are screens and statuses, never thrown errors", () => {
  it("signed out: pages go to login; APIs answer 401", async () => {
    signOut();
    expect((await follow(LeadsPage({ searchParams: Promise.resolve({}) }))).redirect).toBe("/app/login");
    expect((await follow(StudioPage())).redirect).toBe("/app/login");
    expect((await exportRoute()).status).toBe(401);
    const fd = new FormData(); fd.set("file", new File([PNG], "a.png", { type: "image/png" }));
    expect((await uploadRoute(new NextRequest("http://localhost/api/os/assets", { method: "POST", body: fd }))).status).toBe(401);
  });

  it("out of scope after switching workspace: a scope screen, and the same URL works again after switching back", async () => {
    await signIn(U.owner, noCrm);
    expect((await follow(LeadsPage({ searchParams: Promise.resolve({}) }))).redirect).toBe("/app/denied?why=scope");
    await signIn(U.owner, withCrm);
    const ok = await follow(LeadsPage({ searchParams: Promise.resolve({}) }));
    expect(ok.redirect).toBeUndefined(); expect(ok.state).toBeTruthy(); // rendered
  });

  it("wrong role: a client on the staff queue gets the role screen; AI Studio without ai.use likewise", async () => {
    await signIn(U.owner, noCrm);
    expect((await follow(OpsPage())).redirect).toBe("/app/denied?why=role");
    const analyst = await user("analyst"); await db.losMembership.create({ data: { orgId: noCrm, userId: analyst, role: "analyst" } });
    await signIn(analyst, noCrm);
    expect((await follow(StudioPage())).redirect).toBe("/app/denied?why=role");
  });

  it("scheduler endpoint: 401 without the bearer; signed media links: bare 404 unless valid", async () => {
    expect((await tickRoute(new NextRequest("http://localhost/api/os/tick"))).status).toBe(401);
    expect((await tickRoute(new NextRequest("http://localhost/api/os/tick", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    expect((await mediaRoute(new NextRequest("http://localhost/api/os/media/x?exp=1&sig=00"), { params: Promise.resolve({ versionId: "x" }) })).status).toBe(404);
  });
});

describe("client journey through the real actions", () => {
  it("only the client's signature accepts scope — an admin cannot sign, staff cannot sign, the owner can", async () => {
    await signIn(U.staff, noCrm);
    expect((await signContract({}, form({ contractId, decision: "sign" }))).error).toMatch(/forbidden/i); // staff never hold contract.sign — and a refusal is a message, not a thrown error
    await signIn(U.admin, noCrm);
    expect((await signContract({}, form({ contractId, decision: "sign" }))).error).toMatch(/forbidden/i); // separation of duties
    expect((await db.cosContract.findUniqueOrThrow({ where: { id: contractId } })).status).toBe("proposed");
    expect((await entitlements(noCrm)).aiTools.size).toBe(0); // a PROPOSED scope grants no tools
    await signIn(U.owner, noCrm);
    expect((await signContract({}, form({ contractId, decision: "sign" }))).ok).toMatch(/signed/i);
    expect(await db.cosContract.findUniqueOrThrow({ where: { id: contractId } })).toMatchObject({ status: "active", signedById: U.owner });
    expect((await db.cosEngagement.findUniqueOrThrow({ where: { id: engagementId } })).stage).toBe("accepted");
    expect(await db.cosChecklistItem.count({ where: { engagementId } })).toBeGreaterThan(0); // onboarding requests seeded by the action
    const ent = await entitlements(noCrm);
    expect([...ent.aiTools]).toEqual(["linkedin_post"]); expect(ent.modules.has("content")).toBe(true);
    expect((await db.cosCreditGrant.count({ where: { orgId: noCrm } }))).toBe(1);
    // the credits the signed scope INCLUDES arrive once, with the disclosed expiry; the legacy tier placeholder (500) grants nothing
    const { walletSummary } = await import("@/lib/os/credits");
    const w = await walletSummary(noCrm);
    expect(w).toMatchObject({ available: 40, byKind: { included: 40, purchased: 0 } });
    expect(Math.round((w.expiring[0].expiresAt.getTime() - Date.now()) / 86_400_000)).toBe(30);
    // signing twice is refused
    expect((await signContract({}, form({ contractId, decision: "sign" }))).error).toMatch(/already decided/i);
    expect((await walletSummary(noCrm)).available).toBe(40);
    expect(await db.cosCreditGrant.count({ where: { sourceRef: `contract:${contractId}` } })).toBe(1);
  });

  it("upload goes through the upload route: type-sniffed, tenant-scoped, private", async () => {
    await signIn(U.owner, noCrm);
    const fd = new FormData(); fd.set("file", new File([PNG], "logo.png", { type: "image/png" })); fd.set("category", "brand");
    const res = await uploadRoute(new NextRequest("http://localhost/api/os/assets", { method: "POST", body: fd }));
    expect(res.status).toBe(200);
    const { assetId } = (await res.json()) as { assetId: string };
    expect((await db.cosAsset.findUniqueOrThrow({ where: { id: assetId } })).orgId).toBe(noCrm);
    const bad = new FormData(); bad.set("file", new File([Buffer.from("not a png")], "x.png", { type: "image/png" }));
    expect((await uploadRoute(new NextRequest("http://localhost/api/os/assets", { method: "POST", body: bad }))).status).toBe(400);
    // a signed link serves exactly this version while valid
    process.env.MEDIA_PUBLIC_ORIGIN = "https://app.example.com";
    const v = await db.cosAssetVersion.findFirstOrThrow({ where: { assetId } });
    const link = new URL(mediaLink(v.id)!);
    const served = await mediaRoute(new NextRequest(link), { params: Promise.resolve({ versionId: v.id }) });
    expect([served.status, served.headers.get("content-type"), served.headers.get("cache-control")]).toEqual([200, "image/png", "private, no-store"]);
    delete process.env.MEDIA_PUBLIC_ORIGIN;
  });

  it("handover: the workspace turns read-only — AI and tools stop, history stays, export still works", async () => {
    await signIn(U.staff, noCrm);
    await db.cosEngagement.update({ where: { id: engagementId }, data: { stage: "completed" } }); // fixture: delivery finished (stage machine is covered in v2-acceptance)
    expect((await engagementHandOver({}, form({ id: engagementId }))).ok).toMatch(/read-only/i);
    const ent = await entitlements(noCrm);
    expect(ent.accessMode).toBe("read_only"); expect(ent.aiTools.size).toBe(0); // an ended engagement grants no tools…
    await signIn(U.owner, noCrm);
    expect((await studioQuote({}, form({ toolKey: "linkedin_post", topic: "after handover", length: "short" }))).error).toMatch(/read-only/i); // …whatever the credit balance
    const exp = await exportRoute();
    expect(exp.status).toBe(200);
    await signIn(U.admin, noCrm);
    expect((await exportRoute()).status).toBe(200);
    for (const who of [U.staff, U.analyst]) { await signIn(who, noCrm); expect((await exportRoute()).status).toBe(403); } // contracts + money: owner/admin only
  });
});

describe("dev-only stand-ins cannot serve in production", () => {
  it("the local stand-in model route is a bare 404 in production, and without its explicit flag", async () => {
    const { POST } = await import("@/app/api/dev/llm/chat/completions/route");
    const req = () => new NextRequest("http://localhost/api/dev/llm/chat/completions", { method: "POST", body: JSON.stringify({ messages: [] }) });
    const env = process.env as Record<string, string | undefined>, before = { n: env.NODE_ENV, f: env.GROWTHOS_DEV_LLM };
    env.GROWTHOS_DEV_LLM = "1"; env.NODE_ENV = "production";
    expect((await POST(req())).status).toBe(404);
    env.NODE_ENV = before.n; delete env.GROWTHOS_DEV_LLM;
    expect((await POST(req())).status).toBe(404);
    env.GROWTHOS_DEV_LLM = "1";
    expect((await POST(req())).status).toBe(200);
    env.GROWTHOS_DEV_LLM = before.f;
  });
});

describe("scheduler", () => {
  it("overlapping ticks: one runs, the others skip; the lease frees itself afterwards", async () => {
    const results = await Promise.all([runTick(), runTick(), runTick()]);
    expect(results.filter((r) => !r.skipped).length).toBe(1);
    expect((await runTick()).skipped).toBe(false);
    const ok = await tickRoute(new NextRequest("http://localhost/api/os/tick", { headers: { authorization: "Bearer test-cron-secret" } }));
    expect(ok.status).toBe(200);
  });
});
