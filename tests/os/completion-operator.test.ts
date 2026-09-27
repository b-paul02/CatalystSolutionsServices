// Operator entry points: the /admin server actions (platform session via the real signed admin cookie) and the
// engagement-invoice refund path through the webhook route. Global tables (rate cards, packs) are touched carefully:
// nothing here ever ACTIVATES a card, because other suites run in parallel against the same disposable database.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { db } from "@/lib/audit/db";
import { form, jar, signedWebhook, WEBHOOK_SECRET } from "./entry-harness";
import { createSession } from "@/lib/audit/adminAuth";
import { proposeContract } from "@/app/(site)/admin/os/actions";
import * as Op from "@/app/(site)/admin/os/credits/actions";
import { POST as stripeWebhook } from "@/app/api/stripe/webhook/route";
import { walletInvariant, walletSummary } from "@/lib/os/credits";
import { createEngagement } from "@/lib/os/engagement";
import { createRecord, issueRecord } from "@/lib/os/commercial";
import { PROPOSED_RATES } from "@/lib/os/pricing";

process.env.ADMIN_ACCOUNTS = "ops@test.invalid:unused"; process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
const tag = `co-${Date.now()}`;
let orgId: string, engagementId: string, leadId: string;
const asOperator = async () => { jar.clear(); jar.set("admin_session", await createSession("ops@test.invalid")); };
const f = (o: Record<string, string | string[]>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) fd.append(k, x); return fd; };
const webhook = async (event: Record<string, unknown>) => { const { raw, header } = signedWebhook(event); return stripeWebhook(new NextRequest("http://localhost/api/stripe/webhook", { method: "POST", body: raw, headers: { "stripe-signature": header } })); };

beforeAll(async () => {
  orgId = (await db.losOrg.create({ data: { name: `${tag}-client`, market: "IN", demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "prospect", demo: true } });
  leadId = (await db.losUser.create({ data: { email: `${tag}-lead@example.com`, demo: true } })).id;
  await db.losMembership.create({ data: { orgId, userId: leadId, role: "cgo_lead" } });
  engagementId = (await createEngagement(orgId, null, { name: `${tag} engagement`, demo: true }, "platform_admin")).id;
});
afterAll(async () => {
  await db.cosPaymentEvent.deleteMany({ where: { orgId } });
  await db.losAuditEvent.deleteMany({ where: { orgId } });
  await db.cosContract.deleteMany({ where: { orgId } });
  await db.cosWorkspace.deleteMany({ where: { orgId } });
  await db.losMembership.deleteMany({ where: { orgId } });
  await db.losOrg.deleteMany({ where: { id: orgId } });
  await db.losUser.deleteMany({ where: { id: leadId } });
  await db.cosCreditRateCard.deleteMany({ where: { note: { startsWith: tag } } });
  await db.cosCreditPack.deleteMany({ where: { label: { startsWith: tag } } });
});

describe("operator actions", () => {
  it("need a platform session", async () => {
    jar.clear();
    await expect(Op.walletGrant({}, form({ orgId, kind: "included", amount: "50", reason: "x", ref: "abcdefgh-1", noExpiry: "on" }))).rejects.toThrow(/sign in/i);
    expect((await walletSummary(orgId)).available).toBe(0);
  });

  it("proposing scope writes services AND an explicit tool list; unknown tool keys are dropped; nothing is granted until signed", async () => {
    await asOperator();
    expect((await proposeContract({}, f({ orgId, kind: "project", services: ["content"], includedAiCredits: "100", engagementId }))).error).toMatch(/at least one AI Studio tool/i); // credits alone are useless
    const r = await proposeContract({}, f({ orgId, kind: "project", services: ["content"], aiTools: ["linkedin_post", "x_thread", "not_a_tool"], includedAiCredits: "100", includedAiCreditsExpireDays: "90", engagementId }));
    expect(r.ok).toBeTruthy();
    const c = await db.cosContract.findFirstOrThrow({ where: { orgId } });
    expect(c.status).toBe("proposed");
    expect(JSON.parse(c.aiTools)).toEqual(["linkedin_post", "x_thread"]);
    expect(JSON.parse(c.allowances)).toMatchObject({ includedAiCredits: 100, includedAiCreditsExpireDays: 90 });
    expect((await walletSummary(orgId)).available).toBe(0); // proposing grants nothing — only the client's signature does
  });

  it("grants: expiry is an explicit choice, purchased credits cannot be typed in, a double click grants once, adjustments are bounded", async () => {
    await asOperator();
    const base = { orgId, amount: "50", reason: "Included with the engagement (test)" };
    expect((await Op.walletGrant({}, form({ ...base, kind: "included", ref: "grant-ref-0001" }))).error).toMatch(/expiry/i);
    expect((await Op.walletGrant({}, form({ ...base, kind: "purchased", ref: "grant-ref-0002", noExpiry: "on" }))).error).toMatch(/verified payment/i);
    expect((await Op.walletGrant({}, form({ ...base, kind: "included", ref: "grant-ref-0003", noExpiry: "on", reason: "" }))).error).toMatch(/reason/i);
    const once = form({ ...base, kind: "included", ref: "grant-ref-0004", expiresAt: "2099-01-01" });
    expect((await Op.walletGrant({}, once)).ok).toBeTruthy(); await Op.walletGrant({}, once); // same one-time ref
    expect((await walletSummary(orgId)).byKind.included).toBe(50);
    expect((await Op.walletGrant({}, form({ orgId, kind: "adjustment", amount: "-80", reason: "too much", ref: "grant-ref-0005" }))).error).toMatch(/more than the wallet/i);
    expect((await Op.walletGrant({}, form({ orgId, kind: "adjustment", amount: "-20", reason: "Correction: duplicate courtesy grant", ref: "grant-ref-0006" }))).ok).toBeTruthy();
    expect((await walletSummary(orgId)).available).toBe(30);
    expect((await walletInvariant(orgId)).ok).toBe(true);
    expect(await db.losAuditEvent.count({ where: { orgId, action: "ai_credits.admin_grant" } })).toBe(2);
  });

  it("a REAL rate card is refused until its margin can be checked; bad rates never save; release needs an uncertain run", async () => {
    await asOperator();
    expect((await Op.rateCardCreate({}, form({ rates: "{not json", note: `${tag} bad` }))).error).toMatch(/valid JSON/i);
    expect((await Op.rateCardCreate({}, form({ rates: JSON.stringify({ x_post: { base: 0, perKOutputTokens: 0 } }), note: `${tag} zero` }))).error).toMatch(/not both zero/i);
    expect((await Op.rateCardCreate({}, form({ rates: JSON.stringify(PROPOSED_RATES), note: `${tag} proposed` }))).ok).toMatch(/draft/i);
    const draft = await db.cosCreditRateCard.findFirstOrThrow({ where: { note: `${tag} proposed` } });
    expect(draft).toMatchObject({ status: "draft", synthetic: false });
    delete process.env.LLM_PRICE_INPUT_MICROS_PER_MTOK; // provider prices unknown ⇒ profitability unknown ⇒ no
    const refused = await Op.rateCardActivate({}, form({ id: draft.id }));
    expect(refused.error).toMatch(/profitability check failed/i);
    expect((await db.cosCreditRateCard.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("draft");
    expect((await Op.packCreate({}, form({ label: `${tag} pack`, credits: "250", currency: "usd", amountMinor: "2500", market: "US" }))).ok).toBeTruthy();
    await Op.packRetire({}, form({ id: (await db.cosCreditPack.findFirstOrThrow({ where: { label: `${tag} pack` } })).id }));
    expect((await Op.operationRelease({}, form({ id: "nope", reason: "checked" }))).error).toMatch(/not waiting/i);
  });
});

describe("engagement invoice paid by card, then refunded (webhook route)", () => {
  it("the record follows the provider's cumulative refund; a replay changes nothing", async () => {
    const lead = { orgId, userId: leadId, role: "cgo_lead" };
    const rec = await createRecord(lead, { engagementId, kind: "setup", description: "Setup fee (synthetic)", amount: "25000", currency: "INR" });
    await issueRecord(lead, rec.id, "INV-TEST-1");
    const pi = `pi_${tag}`;
    await webhook({ id: `evt_${tag}_paid`, type: "checkout.session.completed", data: { object: { id: `cs_${tag}`, payment_status: "paid", amount_total: 2_500_000, currency: "inr", payment_intent: pi, metadata: { kind: "growthos_record", recordId: rec.id } } } });
    expect(await db.cosCommercialRecord.findUniqueOrThrow({ where: { id: rec.id } })).toMatchObject({ status: "paid", paidBasis: "webhook" });
    const refund = (id: string, amount: number) => webhook({ id, type: "charge.refunded", data: { object: { id: "ch_1", amount: 2_500_000, amount_refunded: amount, currency: "inr", payment_intent: pi } } });
    expect((await (await refund(`evt_${tag}_r1`, 1_000_000)).json()).appliedTo).toBe("record_refund");
    expect(await db.cosCommercialRecord.findUniqueOrThrow({ where: { id: rec.id } })).toMatchObject({ status: "part_paid", paidMinor: 1_500_000n });
    expect((await (await refund(`evt_${tag}_r1`, 1_000_000)).json()).duplicate).toBe(true);
    await refund(`evt_${tag}_r2`, 2_500_000);
    expect(await db.cosCommercialRecord.findUniqueOrThrow({ where: { id: rec.id } })).toMatchObject({ status: "refunded", paidMinor: 0n });
    expect((await db.cosEngagement.findUniqueOrThrow({ where: { id: engagementId } })).paymentStatus).not.toBe("paid");
    // a refund for a payment GrowthOS never applied changes nothing and is left for a person
    expect((await (await webhook({ id: `evt_${tag}_other`, type: "charge.refunded", data: { object: { id: "ch_2", amount: 100, amount_refunded: 100, currency: "inr", payment_intent: "pi_unknown" } } })).json()).appliedTo).toBe("unmatched");
  });
});
