// Brief §12: EVERY service template must instantiate actionable work — inputs, owners (roles), milestones, acceptance
// criteria and deliverables. The earlier suites only instantiated "website". This runs the real `newWorkItem` action
// (type=project) for every template against a workspace whose scope includes it.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { db } from "@/lib/audit/db";
import { form, signIn } from "./entry-harness";
import { newWorkItem } from "@/app/app/(shell)/_os/actions";
import { TEMPLATES, templateProblems } from "@/lib/os/templates";

const tag = `ct-${Date.now()}`, slugs = Object.keys(TEMPLATES);
let orgId: string, leadId: string;

beforeAll(async () => {
  orgId = (await db.losOrg.create({ data: { name: `${tag}-client`, demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", demo: true } });
  leadId = (await db.losUser.create({ data: { email: `${tag}-lead@example.com`, demo: true } })).id;
  await db.losMembership.create({ data: { orgId, userId: leadId, role: "cgo_lead" } });
  await db.cosContract.create({ data: { orgId, status: "active", services: JSON.stringify(slugs), modules: "[]", signedAt: new Date(), demo: true } });
});
afterAll(async () => {
  await db.cosWorkItem.deleteMany({ where: { orgId } });
  for (const m of ["losAuditEvent", "cosContract", "cosWorkspace", "losMembership"] as const) await (db[m] as unknown as { deleteMany: (a: unknown) => Promise<unknown> }).deleteMany({ where: { orgId } });
  await db.losSession.deleteMany({ where: { userId: leadId } });
  await db.losOrg.deleteMany({ where: { id: orgId } });
  await db.losUser.deleteMany({ where: { id: leadId } });
});

describe("service templates", () => {
  it("the catalogue is internally consistent", () => { expect(templateProblems()).toEqual([]); expect(slugs.length).toBeGreaterThanOrEqual(14); });

  it.each(slugs)("%s instantiates a project with milestones that each have an owner role and acceptance criteria", async (slug) => {
    await signIn(leadId, orgId);
    const tpl = TEMPLATES[slug];
    expect((await newWorkItem({}, form({ type: "project", serviceSlug: slug, title: `${slug} project` }))).error).toBeUndefined();
    const project = await db.cosWorkItem.findFirstOrThrow({ where: { orgId, type: "project", serviceSlug: slug } });
    expect(project.acceptanceCriteria).toContain("Deliverables:"); // what gets handed over
    expect(tpl.deliverables.length).toBeGreaterThan(0);
    const ms = await db.cosWorkItem.findMany({ where: { orgId, parentId: project.id } });
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.filter((m) => !m.assignRole || !m.acceptanceCriteria)).toEqual([]); // an owner and a definition of done on every milestone
    expect(ms.every((m) => ["catalyst", "client", "shared"].includes(m.responsibility))).toBe(true);
    // inputs the work needs from the client are declared on the template (they become checklist items at signature)
    expect(tpl.intake.length).toBeGreaterThan(0);
  });
});
