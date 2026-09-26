// WP-17 · Razorpay behind env vars: signature checks, webhook fixtures for both providers through the one handler,
// provider chosen by currency, credit orders granted once, refund reversal. No real call leaves the process.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/audit/db";
import { signedWebhook, WEBHOOK_SECRET } from "./entry-harness";
import { POST as razorpayWebhook } from "@/app/api/razorpay/webhook/route";
import { POST as stripeWebhook } from "@/app/api/stripe/webhook/route";
import { createRecordCheckout } from "@/lib/os/commercial";
import { createCreditCheckout } from "@/lib/os/creditPurchase";
import { normaliseRazorpayEvent, paymentProviderFor, verifyRazorpayCheckout, verifyRazorpayWebhook } from "@/lib/os/razorpay";
import { walletSummary } from "@/lib/os/credits";

const tag = `rzp-${Date.now()}`;
let orgId: string, owner: string, engagementId: string, recordId: string;
const orders: string[] = [];

beforeAll(async () => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_abc"; process.env.RAZORPAY_KEY_SECRET = "ksecret"; process.env.RAZORPAY_WEBHOOK_SECRET = "whsecret";
  process.env.STRIPE_SECRET_KEY = "sk_test_x"; process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://api.razorpay.com/v1/orders") { const b = JSON.parse(String(init?.body)) as { amount: number; currency: string; notes: Record<string, string> }; const id = `order_${orders.length + 1}${tag.replace(/\W/g, "")}`; orders.push(JSON.stringify({ id, ...b })); return Response.json({ id, amount: b.amount, currency: b.currency, notes: b.notes }); }
    throw new Error(`Unexpected outbound request in a test: ${url}`);
  });
  orgId = (await db.losOrg.create({ data: { name: `${tag}-org`, market: "IN", demo: true } })).id;
  await db.cosWorkspace.create({ data: { orgId, kind: "client", currency: "INR", demo: true } });
  owner = (await db.losUser.create({ data: { email: `${tag}-owner@example.com`, demo: true } })).id;
  await db.losMembership.create({ data: { orgId, userId: owner, role: "owner" } });
  engagementId = (await db.cosEngagement.create({ data: { orgId, name: `${tag} eng`, stage: "active", demo: true } })).id;
  recordId = (await db.cosCommercialRecord.create({ data: { orgId, engagementId, kind: "setup", description: `${tag} setup fee`, amountMinor: 499900n, currency: "INR", status: "issued", demo: true } })).id;
  await db.cosCreditPack.create({ data: { label: `${tag} pack`, credits: 100, currency: "INR", amountMinor: 99900, market: "IN", active: true, synthetic: true } });
});
afterAll(async () => {
  await db.cosPaymentEvent.deleteMany({ where: { OR: [{ orgId }, { providerEventId: { contains: tag.replace(/\W/g, "") } }] } });
  await db.cosCreditLedger.deleteMany({ where: { orgId } }); await db.cosCreditGrant.deleteMany({ where: { orgId } }); await db.cosCreditWallet.deleteMany({ where: { orgId } }); await db.cosCreditOrder.deleteMany({ where: { orgId } });
  await db.cosCreditPack.deleteMany({ where: { label: `${tag} pack` } }); await db.cosNotification.deleteMany({ where: { orgId } });
  await db.cosCommercialRecord.deleteMany({ where: { orgId } }); await db.cosEngagementEvent.deleteMany({ where: { orgId } }); await db.cosEngagement.deleteMany({ where: { orgId } });
  await db.losAuditEvent.deleteMany({ where: { orgId } }); await db.cosWorkspace.deleteMany({ where: { orgId } }); await db.losMembership.deleteMany({ where: { orgId } });
  await db.losOrg.deleteMany({ where: { id: orgId } }); await db.losUser.deleteMany({ where: { id: owner } });
  delete process.env.RAZORPAY_KEY_ID; delete process.env.RAZORPAY_KEY_SECRET; delete process.env.RAZORPAY_WEBHOOK_SECRET; delete process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_WEBHOOK_SECRET;
  vi.unstubAllGlobals();
});

const sign = (raw: string) => createHmac("sha256", "whsecret").update(raw).digest("hex");
const hook = (body: unknown, sig?: string) => { const raw = JSON.stringify(body); return razorpayWebhook(new NextRequest("http://app.test/api/razorpay/webhook", { method: "POST", headers: { "x-razorpay-signature": sig ?? sign(raw) }, body: raw })); };
const captured = (paymentId: string, orderId: string, amount: number, notes: Record<string, string>) => ({ event: "payment.captured", payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, currency: "INR", status: "captured", notes } } } });

describe("WP-17 Razorpay", () => {
  it("signatures and normalisation are exact; provider is chosen by currency", () => {
    expect(verifyRazorpayWebhook("{}", sign("{}"))).toBe(true); expect(verifyRazorpayWebhook("{}", sign("{x}"))).toBe(false); expect(verifyRazorpayWebhook("{}", null)).toBe(false);
    const good = createHmac("sha256", "ksecret").update("order_1|pay_1").digest("hex");
    expect(verifyRazorpayCheckout("order_1", "pay_1", good)).toBe(true); expect(verifyRazorpayCheckout("order_1", "pay_2", good)).toBe(false);
    expect(paymentProviderFor("INR")).toBe("razorpay"); expect(paymentProviderFor("USD")).toBe("stripe");
    const e = normaliseRazorpayEvent(captured("pay_9", "order_9", 100, { kind: "x" }))!;
    expect(e).toMatchObject({ id: "rzp_pay:pay_9", type: "checkout.session.completed", livemode: false, data: { object: { id: "order_9", payment_status: "paid", amount_total: 100, currency: "inr", payment_intent: "pay_9" } } });
    expect(normaliseRazorpayEvent({ event: "something.else" })).toBeNull();
  });

  it("an INR invoice gets a Razorpay order; the captured webhook marks it paid once; a bad signature is refused", async () => {
    const actor = { orgId, userId: owner, role: "owner" };
    const url = await createRecordCheckout(actor, recordId, "http://app.test", `${tag}-owner@example.com`);
    expect(url).toMatch(/^http:\/\/app\.test\/app\/pay\/razorpay\?order=order_/);
    const orderId = new URL(url).searchParams.get("order")!;
    const created = JSON.parse(orders.find((o) => o.includes(orderId))!) as { amount: number; notes: Record<string, string> };
    expect(created.amount).toBe(499900); expect(created.notes).toMatchObject({ kind: "growthos_record", recordId });
    expect((await hook(captured("pay_rec1", orderId, 499900, created.notes), "0".repeat(64))).status).toBe(400);
    const r1 = await (await hook(captured("pay_rec1", orderId, 499900, created.notes))).json() as { appliedTo: string; duplicate: boolean };
    expect(r1).toMatchObject({ appliedTo: "commercial_record", duplicate: false });
    expect((await db.cosCommercialRecord.findUniqueOrThrow({ where: { id: recordId } })).status).toBe("paid");
    const r2 = await (await hook(captured("pay_rec1", orderId, 499900, created.notes))).json() as { duplicate: boolean };
    expect(r2.duplicate).toBe(true);
    expect((await db.cosPaymentEvent.findFirst({ where: { providerEventId: "rzp_pay:pay_rec1" } }))!.provider).toBe("razorpay");
    // an amount that does not match is never applied
    const other = await db.cosCommercialRecord.create({ data: { orgId, engagementId, kind: "recurring", description: `${tag} month`, amountMinor: 100000n, currency: "INR", status: "issued", demo: true } });
    const r3 = await (await hook(captured("pay_rec2", "order_zzz", 5, { kind: "growthos_record", recordId: other.id, orgId }))).json() as { appliedTo: string };
    expect(r3.appliedTo).toBe("unmatched"); expect((await db.cosCommercialRecord.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("issued");
  });

  it("credits: INR pack → Razorpay order → captured webhook grants once; refund reverses; Stripe path still works for USD-shaped events", async () => {
    const pack = (await db.cosCreditPack.findFirst({ where: { label: `${tag} pack` } }))!;
    const { url, orderId } = await createCreditCheckout({ orgId, userId: owner, role: "owner" }, pack.id, "http://app.test", `${tag}-owner@example.com`);
    expect(url).toMatch(/\/app\/pay\/razorpay\?order=order_.*&credits=/);
    const order = await db.cosCreditOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.providerMode).toBe("test"); expect(order.providerSessionId).toMatch(/^order_/);
    const notes = { kind: "ai_credits", orderId, orgId };
    expect(((await (await hook(captured("pay_cr1", order.providerSessionId!, 99900, notes))).json()) as { appliedTo: string }).appliedTo).toBe("ai_credits");
    await hook(captured("pay_cr1", order.providerSessionId!, 99900, notes)); // replay
    expect((await walletSummary(orgId)).available).toBe(100);
    const refund = { event: "refund.processed", payload: { refund: { entity: { payment_id: "pay_cr1", amount: 99900, currency: "INR" } }, payment: { entity: { id: "pay_cr1", amount: 99900, amount_refunded: 99900, currency: "INR", notes } } } };
    expect(((await (await hook(refund)).json()) as { appliedTo: string }).appliedTo).toBe("ai_credits_reversal");
    expect((await walletSummary(orgId)).available).toBe(0);
    // the Stripe route is unchanged and records provider "stripe"
    const s = signedWebhook({ id: `evt_${tag}`, type: "payment_intent.created", data: { object: { id: "pi_x" } } });
    const sr = await stripeWebhook(new NextRequest("http://app.test/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": s.header }, body: s.raw }));
    expect(sr.status).toBe(200); expect((await db.cosPaymentEvent.findFirst({ where: { providerEventId: `evt_${tag}` } }))!.provider).toBe("stripe");
  });
});
