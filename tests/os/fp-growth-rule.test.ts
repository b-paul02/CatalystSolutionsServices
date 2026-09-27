// Growth rule: every flow's last screen carries a Growth step whose single button creates or advances a CosGoal or
// CosWorkItem in one of the five pillars. This walks each flow's final action through the entry harness, checks
// idempotence, staff/client rules, read-only refusal, pillar tiles, the weekly section and the print report grouping.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: () => unknown) => fn }));

import { db } from "@/lib/audit/db";
import { form, signIn } from "./entry-harness";
import { advancePillarAction } from "@/app/app/(shell)/_os/growth";
import { pillarTiles, PILLARS5 } from "@/lib/os/pillars";
import type { GrowthStep } from "@/lib/os/pillarDefs";
import { METRICS } from "@/lib/os/metrics";
import { monthlyReport } from "@/lib/os/reports";
import { weeklyPillarSection } from "@/lib/leados/metrics";

const tag = `fpg-${Date.now()}`;
let orgId: string, owner: string, staff: string;
const step = (s: GrowthStep) => form({ step: JSON.stringify(s) });

// The final Growth step of each flow (mirrors the panels in the pages). Every pillar appears at least once.
const FLOWS: { flow: string; step: GrowthStep }[] = [
  { flow: "monitoring (WP-29)", step: { pillar: "digital_presence", metric: "sessions", metricLabel: "Website sessions", action: { kind: "goal", label: "Set an uptime goal", title: "Website answers every check this quarter", unit: "checks passed", horizon: "90 days" } } },
  { flow: "site copy (WP-40)", step: { pillar: "digital_presence", metric: "key_events", metricLabel: "Website key events", action: { kind: "work_item", label: "Ask for a copy review", title: "Review updated site copy: hero.title", type: "task" } } },
  { flow: "chat inbox (WP-44)", step: { pillar: "client_acquisition", metric: "leads", metricLabel: "Enquiries", action: { kind: "goal", label: "Set an enquiries goal", title: "More enquiries from the site chat", unit: "per month", horizon: "90 days" } } },
  { flow: "heatmap (WP-43)", step: { pillar: "digital_presence", metric: "key_events", metricLabel: "Website key events", action: { kind: "work_item", label: "Plan a page experiment", title: "Experiment on /pricing from heatmap findings", type: "experiment" } } },
  { flow: "enrichment (WP-46)", step: { pillar: "market_intelligence", metric: "leads", metricLabel: "Enquiries", action: { kind: "work_item", label: "Plan the outreach", title: "Outreach plan for enriched B2B leads", type: "task" } } },
  { flow: "competitors (WP-47)", step: { pillar: "market_intelligence", metric: "search.position", metricLabel: "Tracked search positions", action: { kind: "goal", label: "Set a visibility goal", title: "Match competitor publishing cadence", unit: "posts per month", horizon: "90 days" } } },
  { flow: "AI visibility (WP-48)", step: { pillar: "digital_visibility", metric: "search.position", metricLabel: "Tracked search positions", action: { kind: "work_item", label: "Brief a page that answers the question", title: "Answer page for: Which clinic offers aligners?", type: "content" } } },
  { flow: "reports / delivery (WP-28)", step: { pillar: "business_operations", metric: "delivered", metricLabel: "Work delivered", action: { kind: "goal", label: "Set a delivery goal", title: "Every cycle delivered on time", unit: "items per month", horizon: "90 days" } } },
  { flow: "search visibility (WP-24)", step: { pillar: "digital_visibility", metric: "clicks", metricLabel: "Search clicks", action: { kind: "goal", label: "Set a search goal", title: "More clicks from search", unit: "per month", horizon: "90 days" } } },
];

beforeAll(async () => {
  orgId = (await db.losOrg.create({ data: { name: `${tag} Co`, demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", demo: true } });
  await db.cosContract.create({ data: { orgId, status: "active", services: JSON.stringify(["website"]), modules: JSON.stringify(["results", "strategy", "content"]), signedAt: new Date(), demo: true } });
  owner = (await db.losUser.create({ data: { email: `${tag}-owner@example.com`, demo: true } })).id;
  staff = (await db.losUser.create({ data: { email: `${tag}-staff@example.com`, demo: true } })).id;
  await db.losMembership.createMany({ data: [{ orgId, userId: owner, role: "owner" }, { orgId, userId: staff, role: "cgo_lead" }] });
});
afterAll(async () => {
  await db.cosWorkEvent.deleteMany({ where: { orgId } }); await db.cosWorkItem.deleteMany({ where: { orgId } }); await db.cosGoal.deleteMany({ where: { orgId } }); await db.cosMetricSnapshot.deleteMany({ where: { orgId } });
  await db.losAuditEvent.deleteMany({ where: { orgId } }); await db.cosContract.deleteMany({ where: { orgId } }); await db.cosWorkspace.deleteMany({ where: { orgId } });
  await db.losMembership.deleteMany({ where: { orgId } }); await db.losSession.deleteMany({ where: { userId: { in: [owner, staff] } } }); await db.losOrg.deleteMany({ where: { id: orgId } }); await db.losUser.deleteMany({ where: { id: { in: [owner, staff] } } });
});

describe("growth rule", () => {
  it("every METRICS entry names one of the five pillars", () => {
    for (const [k, d] of Object.entries(METRICS)) expect(PILLARS5, k).toContain(d.pillar);
  });

  it.each(FLOWS)("$flow — the one button creates or advances a goal / work item in its pillar, idempotently", async ({ step: s }) => {
    await signIn(owner, orgId);
    const first = await advancePillarAction({}, step(s));
    expect(first.error).toBeUndefined(); expect(first.href).toBeTruthy();
    const again = await advancePillarAction({}, step(s));
    expect(again.href).toBe(first.href);
    if (s.action.kind === "goal") {
      const g = await db.cosGoal.findMany({ where: { orgId, pillar: s.pillar, metric: s.metric, archivedAt: null } });
      expect(g).toHaveLength(1); expect(g[0].agreedAt).toBeTruthy(); // the owner may agree goals
    } else {
      const w = await db.cosWorkItem.findMany({ where: { orgId, title: s.action.title, state: { notIn: ["closed", "cancelled"] } } });
      expect(w).toHaveLength(1); expect(JSON.parse(w[0].payload!)).toMatchObject({ pillar: s.pillar, metric: s.metric });
      expect(w[0].type).toBe("change_request"); // a client cannot put work in scope — it lands as a request
    }
  });

  it("staff build work items as tasks and may set goals (strategy.manage); malformed steps are refused", async () => {
    await signIn(staff, orgId);
    const r = await advancePillarAction({}, step({ pillar: "business_operations", metric: "delivered", metricLabel: "Work delivered", action: { kind: "work_item", label: "x", title: `${tag} staff task`, type: "task" } }));
    expect(r.error).toBeUndefined();
    expect((await db.cosWorkItem.findFirstOrThrow({ where: { orgId, title: `${tag} staff task` } })).type).toBe("task");
    const g = await advancePillarAction({}, step({ pillar: "business_operations", metric: "ai.calls", metricLabel: "AI calls", action: { kind: "goal", label: "x", title: "Fewer AI calls" } }));
    expect(g.error).toBeUndefined();
    expect((await advancePillarAction({}, form({ step: "{" }))).error).toMatch(/malformed/);
    expect((await advancePillarAction({}, step({ pillar: "vibes" as GrowthStep["pillar"], metric: "x", metricLabel: "x", action: { kind: "goal", label: "x", title: "x" } }))).error).toMatch(/malformed/);
  });

  it("read-only workspaces refuse the step", async () => {
    await db.cosWorkspace.update({ where: { orgId }, data: { accessMode: "read_only" } });
    await signIn(owner, orgId);
    expect((await advancePillarAction({}, step({ pillar: "client_acquisition", metric: "qualified", metricLabel: "Qualified", action: { kind: "goal", label: "x", title: "x" } }))).error).toMatch(/read-only/);
    await db.cosWorkspace.update({ where: { orgId }, data: { accessMode: "active" } });
  });

  it("dashboard tiles, the weekly section and the monthly report all group by the five pillars; missing stays absent", async () => {
    await db.cosMetricSnapshot.create({ data: { orgId, provider: "ga4", metric: "sessions", kind: "daily", dimKey: "org", periodStart: new Date(Date.UTC(2026, 8, 20)), value: 120, source: "api", demo: true } });
    const tiles = await pillarTiles(orgId, true);
    expect(tiles.map((t) => t.pillar)).toEqual([...PILLARS5]);
    const presence = tiles.find((t) => t.pillar === "digital_presence")!;
    expect(presence.goal?.metric).toBe("sessions"); expect(presence.latest).toMatchObject({ metric: "sessions", value: 120 }); expect(presence.next?.title).toMatch(/copy|Experiment/);
    expect(tiles.find((t) => t.pillar === "business_operations")!.latest).toBeNull();
    const weekly = await weeklyPillarSection(orgId, new Date(Date.now() - 7 * 86_400_000));
    expect(weekly).toContain("• Digital presence: goal sessions"); expect(weekly).not.toMatch(/because|caused|drove/i);
    const r = await monthlyReport(orgId, "2026-09", "UTC", true);
    expect(r.sections.map((s) => s.pillar)).toEqual([...PILLARS5]);
    expect(r.sections.find((s) => s.pillar === "digital_presence")!.goals[0].metric).toBe("sessions");
  });
});
