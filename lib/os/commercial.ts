// Commercial records and payment reconciliation (GrowthOS v2, brief §A + §J).
// Amounts are entered per engagement — nothing here invents a price. "Paid" has two honest
// bases: a signature-verified provider webhook, or a person recording an external payment.
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/audit/db";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { logLosAudit } from "@/lib/leados/audit";
import { WorkError, type WorkActor } from "./work";
import { derivePaymentStatus } from "./engagement";
import { notify } from "./notify";

export const RECORD_KINDS = ["setup", "recurring", "change", "other"] as const;
export const RECORD_STATUSES = ["draft", "issued", "part_paid", "paid", "overdue", "void", "refunded"] as const;

/** "1,250.50" → 125050n. Minor units everywhere; never floats in storage. */
export function toMinor(major: string | number): bigint {
  const s = String(major).replace(/[, ]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new WorkError("Enter an amount like 1250 or 1250.50.");
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
}
export const formatMinor = (minor: bigint | number, currency: string): string =>
  new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(minor) / 100);

async function recomputePayment(orgId: string, engagementId: string, actorId: string | null) {
  const [e, records] = await Promise.all([
    db.cosEngagement.findFirst({ where: { id: engagementId, orgId } }),
    db.cosCommercialRecord.findMany({ where: { orgId, engagementId }, select: { status: true, dueAt: true } }),
  ]);
  if (!e) return;
  const next = derivePaymentStatus(records);
  if (next === e.paymentStatus) return;
  await db.$transaction([
    db.cosEngagement.update({ where: { id: e.id }, data: { paymentStatus: next } }),
    db.cosEngagementEvent.create({ data: { orgId, engagementId, actorId, actorType: actorId ? "user" : "system", kind: "payment", fromValue: e.paymentStatus, toValue: next } }),
  ]);
}

const staff = (actor: WorkActor) => { if (!isStaffRole(actor.role) || !can(actor.role, "work.manage")) throw new WorkError("Forbidden."); };

export async function createRecord(actor: WorkActor, input: { engagementId: string; kind: string; description: string; amount: string; currency: string; dueAt?: Date | null; invoiceRef?: string; invoiceUrl?: string; managedExternally?: boolean }) {
  staff(actor);
  const e = await db.cosEngagement.findFirst({ where: { id: input.engagementId, orgId: actor.orgId } });
  if (!e) throw new WorkError("Engagement not found.");
  if (!(RECORD_KINDS as readonly string[]).includes(input.kind) || input.kind === "change") throw new WorkError("Pick setup, recurring or other — change fees come from approved change requests.");
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new WorkError("Currency must be a 3-letter code.");
  if (input.invoiceUrl && !/^https:\/\//i.test(input.invoiceUrl)) throw new WorkError("Invoice links must be https.");
  if (!input.description.trim()) throw new WorkError("Describe the fee.");
  const rec = await db.cosCommercialRecord.create({
    data: { orgId: actor.orgId, engagementId: e.id, kind: input.kind, description: input.description.trim().slice(0, 300), amountMinor: toMinor(input.amount), currency: input.currency, dueAt: input.dueAt ?? null, invoiceRef: input.invoiceRef?.trim() || null, invoiceUrl: input.invoiceUrl || null, managedExternally: input.managedExternally ?? true, status: input.invoiceRef?.trim() ? "issued" : "draft", createdById: actor.userId, demo: e.demo },
  });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "commercial.record_created", entity: "CosCommercialRecord", entityId: rec.id, data: { kind: input.kind, currency: input.currency } });
  await recomputePayment(actor.orgId, e.id, actor.userId);
  return rec;
}

/** Client-approved paid change → exactly one commercial record (unique engagement+kind+workItemId). */
export async function recordApprovedChange(orgId: string, engagementId: string, workItemId: string, title: string, chargeMajor: number, approvedById: string) {
  const [e, org] = await Promise.all([db.cosEngagement.findFirst({ where: { id: engagementId, orgId } }), db.losOrg.findUnique({ where: { id: orgId }, select: { market: true } })]);
  if (!e) return;
  const currency = e.currency ?? (org?.market === "US" ? "USD" : "INR");
  try {
    await db.cosCommercialRecord.create({ data: { orgId, engagementId, kind: "change", workItemId, description: `Approved change: ${title}`.slice(0, 300), amountMinor: toMinor(chargeMajor.toFixed(2)), currency, createdById: approvedById, demo: e.demo } });
  } catch (err) { if ((err as { code?: string }).code !== "P2002") throw err; return; }
  await recomputePayment(orgId, engagementId, approvedById);
  await notify({ orgId, audience: "staff", kind: "payment", title: `Change approved — raise the invoice: ${title}`, href: `/app/engagement/${engagementId}`, dedupeKey: `change-fee:${workItemId}` });
}

export async function issueRecord(actor: WorkActor, id: string, invoiceRef: string, invoiceUrl?: string, dueAt?: Date | null) {
  staff(actor);
  const rec = await db.cosCommercialRecord.findFirst({ where: { id, orgId: actor.orgId } });
  if (!rec) throw new WorkError("Record not found.");
  if (!invoiceRef.trim()) throw new WorkError("Enter the invoice number from your invoicing system.");
  if (invoiceUrl && !/^https:\/\//i.test(invoiceUrl)) throw new WorkError("Invoice links must be https.");
  if (!["draft", "issued"].includes(rec.status)) throw new WorkError(`This record is already ${rec.status}.`);
  await db.cosCommercialRecord.update({ where: { id: rec.id }, data: { status: "issued", invoiceRef: invoiceRef.trim().slice(0, 80), invoiceUrl: invoiceUrl || rec.invoiceUrl, dueAt: dueAt === undefined ? rec.dueAt : dueAt } });
  await recomputePayment(actor.orgId, rec.engagementId, actor.userId);
}

/** A person records a payment made outside GrowthOS. Labelled "recorded", never "verified". */
export async function recordExternalPayment(actor: WorkActor, id: string, amount: string, reference: string) {
  staff(actor);
  const rec = await db.cosCommercialRecord.findFirst({ where: { id, orgId: actor.orgId } });
  if (!rec) throw new WorkError("Record not found.");
  if (["void", "refunded", "paid"].includes(rec.status)) throw new WorkError(`This record is already ${rec.status}.`);
  if (!reference.trim()) throw new WorkError("Enter the bank / gateway reference so this can be audited.");
  const paid = rec.paidMinor + toMinor(amount);
  if (paid > rec.amountMinor) throw new WorkError("That is more than the amount due.");
  await db.$transaction([
    db.cosPaymentEvent.create({ data: { orgId: actor.orgId, recordId: rec.id, provider: "manual", providerEventId: `manual:${rec.id}:${reference.trim().slice(0, 80)}`, type: "external_payment", amountMinor: toMinor(amount), currency: rec.currency, verified: false, appliedTo: "commercial_record", note: `Recorded by a team member. Ref ${reference.trim().slice(0, 80)}` } }),
    db.cosCommercialRecord.update({ where: { id: rec.id }, data: { paidMinor: paid, status: paid === rec.amountMinor ? "paid" : "part_paid", paidBasis: "recorded" } }),
  ]).catch((e) => { if ((e as { code?: string }).code === "P2002") throw new WorkError("That payment reference is already recorded."); throw e; });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "commercial.payment_recorded", entity: "CosCommercialRecord", entityId: rec.id });
  await recomputePayment(actor.orgId, rec.engagementId, actor.userId);
}

export async function voidRecord(actor: WorkActor, id: string, reason: string) {
  staff(actor);
  const rec = await db.cosCommercialRecord.findFirst({ where: { id, orgId: actor.orgId } });
  if (!rec) throw new WorkError("Record not found.");
  if (rec.paidMinor > 0n) throw new WorkError("Money has been received against this record — it cannot be voided.");
  if (!reason.trim()) throw new WorkError("A reason is required.");
  await db.cosCommercialRecord.update({ where: { id: rec.id }, data: { status: "void" } });
  await logLosAudit({ orgId: actor.orgId, actorUserId: actor.userId, actorType: "user", action: "commercial.record_voided", entity: "CosCommercialRecord", entityId: rec.id, data: { reason: reason.slice(0, 300) } });
  await recomputePayment(actor.orgId, rec.engagementId, actor.userId);
}

// ── Stripe webhook ───────────────────────────────────────────────────────────

/**
 * Stripe-Signature: "t=<unix>,v1=<hex>[,v1=<hex>]". signed payload = `${t}.${rawBody}`, HMAC-SHA256
 * with the endpoint secret. Constant-time compare; rejects timestamps outside the tolerance (replay).
 */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string | undefined, now = Date.now(), toleranceSec = 300): boolean {
  if (!secret || !header) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || sigs.length === 0) return false;
  if (Math.abs(now / 1000 - Number(t)) > toleranceSec) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"));
  return sigs.some((s) => { const got = Buffer.from(s); return got.length === expected.length && timingSafeEqual(got, expected); });
}

type StripeEvent = { id: string; type: string; livemode?: boolean; data: { object: Record<string, unknown> } };
export type PaymentProvider = "stripe" | "razorpay";

/** Stripe-shaped events from either provider (Razorpay is normalised in lib/os/razorpay.ts). */
export const handleStripeEvent = (event: StripeEvent) => handlePaymentEvent("stripe", event);

/**
 * Apply a VERIFIED event exactly once. The unique providerEventId row is written first:
 * a replayed delivery finds it and does nothing. If applying fails the row is removed so
 * the provider's retry can succeed. WP-17: one handler for both providers.
 */
export async function handlePaymentEvent(provider: PaymentProvider, event: StripeEvent): Promise<{ duplicate: boolean; appliedTo: string }> {
  const obj = event.data.object as { id?: string; payment_status?: string; amount_total?: number; amount_refunded?: number; currency?: string; subscription?: string; payment_intent?: unknown; metadata?: Record<string, string> };
  const paymentId = typeof obj.payment_intent === "string" ? obj.payment_intent : null;
  const meta = obj.metadata ?? {};
  let row;
  try {
    row = await db.cosPaymentEvent.create({ data: { orgId: null, provider, providerEventId: event.id, type: event.type, amountMinor: obj.amount_total == null ? null : BigInt(obj.amount_total), currency: obj.currency?.toUpperCase() ?? null, verified: true } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { duplicate: true, appliedTo: "duplicate" };
    throw e;
  }
  let appliedTo = "unmatched", orgId: string | null = null, recordId: string | null = null, note: string | null = null, creditOrderId: string | null = null;
  try {
    // AI-credit orders first: their own ledger, never mixed with invoices or lead tokens
    const { handleCreditEvent } = await import("./creditPurchase");
    const credit = await handleCreditEvent(event);
    const paidSession = credit ? false : (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && obj.payment_status === "paid" && obj.id;
    if (credit) { appliedTo = credit.appliedTo; orgId = credit.orgId; creditOrderId = credit.orderId; note = credit.note; }
    else if (paidSession && (meta.kind === "leados_tokens" || meta.kind === "leados_subscription") && meta.orgId && (await db.losOrg.findUnique({ where: { id: meta.orgId }, select: { id: true } }))) {
      const { applyPaidCheckout } = await import("@/lib/leados/billing");
      const r = await applyPaidCheckout(meta.orgId, obj.id!, meta, obj.subscription ?? null);
      orgId = meta.orgId; appliedTo = meta.kind === "leados_tokens" ? "token_pack" : "subscription"; note = r.message.slice(0, 200);
    } else if (paidSession && meta.kind === "growthos_record" && meta.recordId) {
      const rec = await db.cosCommercialRecord.findUnique({ where: { id: meta.recordId } });
      // amount AND currency must match what we asked for — never trust metadata alone
      if (rec && rec.currency === obj.currency?.toUpperCase() && BigInt(obj.amount_total ?? -1) === rec.amountMinor - rec.paidMinor) {
        await db.cosCommercialRecord.update({ where: { id: rec.id }, data: { paidMinor: rec.amountMinor, status: "paid", paidBasis: "webhook" } });
        orgId = rec.orgId; recordId = rec.id; appliedTo = "commercial_record";
        await recomputePayment(rec.orgId, rec.engagementId, null);
        await notify({ orgId: rec.orgId, audience: "staff", kind: "payment", title: `Payment confirmed: ${rec.description}`, href: `/app/engagement/${rec.engagementId}`, dedupeKey: `paid:${rec.id}` });
      } else note = "Record not found or amount/currency mismatch — needs manual review.";
    } else if (paidSession && meta.program) {
      appliedTo = "deposit"; note = "Onboarding deposit (marketing checkout) — link it to an engagement when the workspace is provisioned.";
    } else if (event.type === "charge.refunded" && paymentId) {
      // an engagement invoice paid by card and later refunded: the record follows the provider's cumulative total
      const paid = await db.cosPaymentEvent.findFirst({ where: { providerPaymentId: paymentId, appliedTo: "commercial_record", recordId: { not: null } } });
      const rec = paid?.recordId ? await db.cosCommercialRecord.findUnique({ where: { id: paid.recordId } }) : null;
      if (rec && rec.currency === obj.currency?.toUpperCase()) {
        const refunded = BigInt(obj.amount_refunded ?? 0);
        const left = rec.amountMinor > refunded ? rec.amountMinor - refunded : 0n;
        await db.cosCommercialRecord.update({ where: { id: rec.id }, data: { paidMinor: left, status: left === 0n ? "refunded" : "part_paid" } });
        orgId = rec.orgId; recordId = rec.id; appliedTo = "record_refund";
        await recomputePayment(rec.orgId, rec.engagementId, null);
        await notify({ orgId: rec.orgId, audience: "staff", kind: "payment", title: `Refund recorded: ${rec.description}`, href: `/app/engagement/${rec.engagementId}`, dedupeKey: `refund:${event.id}` });
      } else note = "Refund for a payment GrowthOS did not apply (for example a lead-token pack) — review it by hand.";
    } else if (event.type.startsWith("charge.dispute.") && paymentId) {
      const paid = await db.cosPaymentEvent.findFirst({ where: { providerPaymentId: paymentId, orgId: { not: null } } });
      note = "Payment dispute — no balance was changed automatically; review it by hand.";
      if (paid?.orgId) { orgId = paid.orgId; await notify({ orgId: paid.orgId, audience: "staff", kind: "payment", title: `Payment dispute (${event.type.split(".").pop()}) — review needed`, href: "/admin/os", dedupeKey: `dispute:${event.id}` }); }
    } else note = `No handler for ${event.type}.`;
  } catch (e) {
    await db.cosPaymentEvent.delete({ where: { id: row.id } }).catch(() => {});
    throw e;
  }
  await db.cosPaymentEvent.update({ where: { id: row.id }, data: { appliedTo, orgId, recordId, note, creditOrderId, providerPaymentId: paymentId } });
  return { duplicate: false, appliedTo };
}

/** Optional online payment for a record: Razorpay for INR when configured (WP-17), else Stripe; otherwise invoices stay external. */
export async function createRecordCheckout(actor: WorkActor, recordId: string, origin: string, email: string): Promise<string> {
  if (!can(actor.role, "org.billing")) throw new WorkError("Forbidden.");
  const rec = await db.cosCommercialRecord.findFirst({ where: { id: recordId, orgId: actor.orgId, status: { in: ["issued", "part_paid", "overdue"] } } });
  if (!rec) throw new WorkError("Nothing to pay on this record.");
  const { paymentProviderFor, createRazorpayOrder } = await import("./razorpay");
  const provider = paymentProviderFor(rec.currency);
  if (!provider) throw new WorkError("Online payment is not set up — pay the invoice using the details on it.");
  if (provider === "razorpay") {
    const order = await createRazorpayOrder({ amountMinor: Number(rec.amountMinor - rec.paidMinor), currency: rec.currency, receipt: rec.id, notes: { kind: "growthos_record", recordId: rec.id, orgId: rec.orgId } });
    return `${origin}/app/pay/razorpay?order=${order.id}&record=${rec.id}`;
  }
  const { stripePost } = await import("@/lib/leados/billing");
  const session = await stripePost("/checkout/sessions", new URLSearchParams({
    mode: "payment", success_url: `${origin}/app/engagement/${rec.engagementId}?paid=1`, cancel_url: `${origin}/app/engagement/${rec.engagementId}`, customer_email: email,
    "metadata[kind]": "growthos_record", "metadata[recordId]": rec.id, "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": rec.currency.toLowerCase(), "line_items[0][price_data][unit_amount]": String(rec.amountMinor - rec.paidMinor),
    "line_items[0][price_data][product_data][name]": rec.description.slice(0, 120),
  }));
  return String(session.url);
}
