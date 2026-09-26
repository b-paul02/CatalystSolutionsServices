// WP-02 jobs admin + WP-03 error capture, through the real operator actions and the capture function.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { db } from "@/lib/audit/db";
import { form, signIn, signOut } from "./entry-harness";
import { killJob, retryJob } from "@/app/(site)/admin/os/jobs/actions";
import { resolveError } from "@/app/(site)/admin/os/errors/actions";
import { captureError, fingerprintOf, normaliseMessage, sweepErrors } from "@/lib/os/errors";
import { onRequestError } from "@/instrumentation";

const tag = `fpo-${Date.now()}`;
let admin: string, plain: string, orgId: string;

beforeAll(async () => {
  admin = (await db.losUser.create({ data: { email: `${tag}-admin@example.com`, platformRole: "super_admin", demo: true } })).id;
  plain = (await db.losUser.create({ data: { email: `${tag}-plain@example.com`, demo: true } })).id;
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, demo: true } })).id;
});
afterAll(async () => {
  await db.losJob.deleteMany({ where: { type: { startsWith: tag } } });
  await db.cosErrorEvent.deleteMany({ where: { message: { contains: tag } } });
  await db.cosNotification.deleteMany({ where: { orgId } });
  await db.losSession.deleteMany({ where: { userId: { in: [admin, plain] } } });
  await db.losOrg.deleteMany({ where: { id: orgId } });
  await db.losUser.deleteMany({ where: { id: { in: [admin, plain] } } });
});

describe("WP-02 jobs admin", () => {
  it("retry resets a dead job to pending; kill marks a pending job dead; non-platform users are refused", async () => {
    const dead = await db.losJob.create({ data: { type: `${tag}.dead`, status: "dead", attempts: 5, lastError: "boom" } });
    const pending = await db.losJob.create({ data: { type: `${tag}.pending`, status: "pending" } });
    await signIn(plain, orgId);
    await expect(retryJob({}, form({ id: dead.id }))).rejects.toThrow(/Sign in required|Forbidden/);
    await signIn(admin, orgId);
    expect((await retryJob({}, form({ id: dead.id }))).ok).toMatch(/Queued/);
    const r = (await db.losJob.findUnique({ where: { id: dead.id } }))!;
    expect(r.status).toBe("pending"); expect(r.attempts).toBe(0); expect(r.lastError).toBeNull();
    expect((await killJob({}, form({ id: pending.id }))).ok).toMatch(/dead/);
    expect((await db.losJob.findUnique({ where: { id: pending.id } }))!.status).toBe("dead");
    expect((await killJob({}, form({ id: pending.id }))).error).toBeTruthy();
    signOut();
  });
});

describe("WP-03 error capture", () => {
  it("fingerprints the same error once, counts repeats, notifies staff once, never stores a body", async () => {
    const e1 = new Error(`${tag} lead 12345 not found for "alice@example.com"`);
    const e2 = new Error(`${tag} lead 99999 not found for "bob@example.com"`);
    expect(normaliseMessage(e1.message)).toBe(normaliseMessage(e2.message));
    const a = await captureError(e1, { route: "GET /app/leads/[id]", orgId });
    const b = await captureError(e2, { route: "GET /app/leads/[id]", orgId });
    expect(a.fresh).toBe(true); expect(b.fresh).toBe(false); expect(a.fingerprint).toBe(b.fingerprint);
    const row = (await db.cosErrorEvent.findUnique({ where: { fingerprint: a.fingerprint } }))!;
    expect(row.count).toBe(2); expect(row.route).toBe("GET /app/leads/[id]");
    expect(await db.cosNotification.count({ where: { orgId, kind: "app_error", dedupeKey: `error:${a.fingerprint}` } })).toBe(1);
    // a different route is a different fingerprint
    expect(fingerprintOf(e1.message, "POST /x")).not.toBe(a.fingerprint);
    // the Next.js hook only sees the path, never the query string
    process.env.NEXT_RUNTIME = "nodejs";
    await onRequestError(new Error(`${tag} hook error`), { path: "/api/os/hooks/abc?token=SECRET&email=x@y.z", method: "POST" }, {});
    const hooked = await db.cosErrorEvent.findFirst({ where: { message: `${tag} hook error` } });
    expect(hooked?.route).toBe("POST /api/os/hooks/abc"); expect(hooked?.route).not.toContain("SECRET");
    // resolve hides it; a recurrence reopens it
    await signIn(admin, orgId);
    expect((await resolveError({}, form({ id: row.id }))).ok).toBe("Resolved.");
    await captureError(e1, { route: "GET /app/leads/[id]", orgId });
    expect((await db.cosErrorEvent.findUnique({ where: { id: row.id } }))!.resolvedAt).toBeNull();
    // retention: rows last seen 91 days ago are swept, fresh ones stay
    await db.cosErrorEvent.update({ where: { id: hooked!.id }, data: { lastAt: new Date(Date.now() - 91 * 86_400_000) } });
    expect(await sweepErrors()).toBeGreaterThanOrEqual(1);
    expect(await db.cosErrorEvent.findUnique({ where: { id: hooked!.id } })).toBeNull();
    expect(await db.cosErrorEvent.findUnique({ where: { id: row.id } })).not.toBeNull();
    signOut();
  });
});
