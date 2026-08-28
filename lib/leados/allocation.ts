// The allocation engine (blueprint §5.6). Preview computes without writing;
// execute claims inventory rows with FOR UPDATE SKIP LOCKED, creates immutable
// allocations, materializes leads in the client org, and debits tokens — all
// idempotent per (plan, runDate).
import { db } from "@/lib/audit/db";
import { computeDue, isPlanDueOn, localDateStr, matchesTargeting, type TargetingRule } from "./allocationRules";
import { decideUse } from "./compliance";
import { contactHashes } from "./suppression";
import { computeTokenCost, debitTokensTx, tokenBalance } from "./tokens";
import { createLead, type LawfulUse, type LeadInput } from "./leadWrite";
import { logLosAudit } from "./audit";

export type AllocationResult = {
  planId: string;
  runDate: string;
  due: number;
  rollover: number;
  eligible: number;
  allocated: number;
  shortage: number;
  reasons: Record<string, number>;
  executed: boolean;
  skipped?: string; // set when the run didn't apply (not a working day, done already…)
};

const j = <T,>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

export async function allocatePlan(planId: string, opts: { execute: boolean; runDate?: string; now?: Date }): Promise<AllocationResult> {
  const now = opts.now ?? new Date();
  const plan = await db.losLeadPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error("Plan not found.");
  const runDate = opts.runDate ?? localDateStr(plan.deliveryTimezone, now);
  const base: AllocationResult = {
    planId, runDate, due: 0, rollover: 0, eligible: 0, allocated: 0, shortage: 0, reasons: {}, executed: false,
  };

  if (plan.status !== "active") return { ...base, skipped: `plan_${plan.status}` };
  const cal = {
    startDate: plan.startDate.toISOString().slice(0, 10),
    endDate: plan.endDate ? plan.endDate.toISOString().slice(0, 10) : null,
    workingDays: j<number[]>(plan.workingDays, [1, 2, 3, 4, 5]),
    holidays: j<string[]>(plan.holidays, []),
  };
  if (!isPlanDueOn(cal, runDate)) return { ...base, skipped: "not_a_working_day" };

  // Idempotency: one executed run per plan+date.
  const existing = await db.losAllocationRun.findUnique({ where: { planId_runDate: { planId, runDate } } });
  if (existing && opts.execute) return { ...base, skipped: "already_executed" };

  const priorRuns = (
    await db.losAllocationRun.findMany({ where: { planId, status: "executed" }, select: { runDate: true, due: true, allocated: true } })
  ).map((r) => ({ runDate: r.runDate, due: r.due, allocated: r.allocated }));
  const { due, rollover } = computeDue(
    plan.dailyQuota,
    plan.rolloverPolicy as "none" | "week" | "campaign_end" | "approval",
    runDate,
    priorRuns,
  );

  const targeting = j<TargetingRule | null>(plan.targeting, null);
  const reasons: Record<string, number> = {};
  const bump = (r: string, n = 1) => (reasons[r] = (reasons[r] ?? 0) + n);

  // Candidate pool (over-fetch: filters below thin it out).
  const candidates = await db.losInventoryRecord.findMany({
    where: {
      leadType: plan.leadType,
      status: "available",
      qualityScore: { gte: plan.minQuality },
      OR: [{ reservedForOrgId: null }, { reservedForOrgId: plan.orgId }],
      dataset: { status: "approved" },
    },
    include: { dataset: true },
    orderBy: [{ reservedForOrgId: "desc" }, { qualityScore: "desc" }, { createdAt: "desc" }],
    take: Math.max(due * 6, 200),
  });

  // Batched lookups — Neon round trips are the cost driver, so everything the
  // per-record checks need is fetched in one query each.
  const candidateIds = candidates.map((c) => c.id);
  const emails = candidates.map((c) => c.normalizedEmail).filter(Boolean) as string[];
  const phones = candidates.map((c) => c.normalizedPhone).filter(Boolean) as string[];
  const [alreadyOwned, dupLeads, suppressionRows, org] = await Promise.all([
    db.losAllocation.findMany({
      where: { orgId: plan.orgId, inventoryRecordId: { in: candidateIds } },
      select: { inventoryRecordId: true },
    }),
    db.losLead.findMany({
      where: {
        orgId: plan.orgId, leadType: plan.leadType, deletedAt: null,
        OR: [
          ...(emails.length ? [{ normalizedEmail: { in: emails } }] : []),
          ...(phones.length ? [{ normalizedPhone: { in: phones } }] : []),
        ],
      },
      select: { normalizedEmail: true, normalizedPhone: true },
    }),
    db.losSuppressionEntry.findMany({
      where: {
        contactHash: { in: candidates.flatMap((c) => contactHashes(c.normalizedEmail, c.normalizedPhone)) },
        OR: [{ scope: "global" }, { scope: "org", orgId: plan.orgId }],
      },
      select: { contactHash: true },
    }),
    db.losOrg.findUnique({ where: { id: plan.orgId }, select: { industry: true } }),
  ]);
  const ownedSet = new Set(alreadyOwned.map((a) => a.inventoryRecordId));
  const dupEmailSet = new Set(dupLeads.map((l) => l.normalizedEmail).filter(Boolean));
  const dupPhoneSet = new Set(dupLeads.map((l) => l.normalizedPhone).filter(Boolean));
  const suppressedSet = new Set(suppressionRows.map((s) => s.contactHash));
  const costCache = new Map<string, Awaited<ReturnType<typeof computeTokenCost>>>();
  const costFor = async (verified: boolean) => {
    const key = String(verified);
    if (!costCache.has(key)) {
      costCache.set(key, await computeTokenCost({
        leadType: plan.leadType as "b2b" | "b2c",
        industry: org?.industry ?? null,
        exclusivity: plan.exclusivity as "exclusive" | "shared",
        verified,
      }));
    }
    return costCache.get(key)!;
  };

  const eligibleRecords: { record: (typeof candidates)[number]; tokens: number; snapshot: unknown }[] = [];
  for (const record of candidates) {
    if (eligibleRecords.length >= due) break;
    if (record.expiresAt && record.expiresAt <= now) { bump("expired"); continue; }
    if (record.dataset.coolingDays > 0 && record.lastAllocatedAt &&
        now.getTime() - record.lastAllocatedAt.getTime() < record.dataset.coolingDays * 86_400_000) {
      bump("cooling"); continue;
    }
    if (!matchesTargeting(record, targeting)) { bump("targeting"); continue; }
    const purposeRestriction = j<string[]>(record.dataset.purposeRestriction, []);
    if (purposeRestriction.length > 0 && !purposeRestriction.includes(plan.purpose)) { bump("dataset_purpose"); continue; }
    // Exclusivity: plan wanting exclusive gets only never-allocated records.
    if (plan.exclusivity === "exclusive" && record.allocationCount > 0) { bump("not_exclusive"); continue; }
    if (record.allocationCount >= record.maxAllocations) { bump("share_limit"); continue; }
    if (ownedSet.has(record.id)) { bump("already_owned"); continue; }
    if ((record.normalizedEmail && dupEmailSet.has(record.normalizedEmail)) ||
        (record.normalizedPhone && dupPhoneSet.has(record.normalizedPhone))) {
      bump("duplicate_in_org"); continue;
    }

    // B2C compliance: purpose engine + suppression at allocation time.
    if (plan.leadType === "b2c") {
      const lu = j<LawfulUse | null>(record.dataset.lawfulUse, null);
      const decision = decideUse({
        permittedPurposes: lu?.purposes ?? [],
        permittedChannels: lu?.channels ?? [],
        purpose: plan.purpose,
        now,
      });
      if (decision.decision !== "allow") { bump(`compliance_${"reason" in decision ? decision.reason : "review"}`); continue; }
      if (contactHashes(record.normalizedEmail, record.normalizedPhone).some((h) => suppressedSet.has(h))) {
        bump("suppressed"); continue;
      }
    }

    const cost = await costFor(Boolean(record.normalizedPhone && record.normalizedEmail));
    eligibleRecords.push({ record, tokens: cost.tokens, snapshot: cost });
  }

  base.due = due;
  base.rollover = rollover;
  base.eligible = eligibleRecords.length;

  // Token budget: stop where the balance runs out.
  const balance = await tokenBalance(plan.orgId);
  let budget = balance;
  const affordable: typeof eligibleRecords = [];
  for (const e of eligibleRecords) {
    if (budget - e.tokens < 0) { bump("insufficient_tokens"); continue; }
    budget -= e.tokens;
    affordable.push(e);
  }

  if (!opts.execute) {
    return { ...base, allocated: affordable.length, shortage: Math.max(0, due - affordable.length), reasons };
  }

  // ── execute ────────────────────────────────────────────────────────────────
  const run = await db.losAllocationRun
    .create({ data: { planId, runDate, status: "executed", due, allocated: 0, shortage: due, detail: null } })
    .catch(() => null);
  if (!run) return { ...base, skipped: "already_executed" }; // unique(planId,runDate) raced

  let allocated = 0;
  for (const { record, tokens, snapshot } of affordable) {
    try {
      // Claim the row: guarded update beats concurrent allocators of shared pools.
      const claim = await db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string; allocationCount: number; maxAllocations: number }[]>`
          SELECT id, "allocationCount", "maxAllocations" FROM "LosInventoryRecord"
          WHERE id = ${record.id} AND status = 'available'
          FOR UPDATE SKIP LOCKED`;
        if (rows.length === 0) return null;
        const row = rows[0];
        if (row.allocationCount >= row.maxAllocations) return null;
        const newCount = row.allocationCount + 1;
        await tx.losInventoryRecord.update({
          where: { id: record.id },
          data: {
            allocationCount: newCount,
            lastAllocatedAt: new Date(),
            status: newCount >= row.maxAllocations ? "allocated" : "available",
          },
        });
        const allocation = await tx.losAllocation.create({
          data: {
            runId: run.id, planId, orgId: plan.orgId, inventoryRecordId: record.id,
            tokensCharged: tokens, rateSnapshot: JSON.stringify(snapshot),
          },
        });
        await debitTokensTx(tx, {
          orgId: plan.orgId, amount: tokens, kind: "allocation_debit",
          refId: allocation.id, note: `Lead delivery ${runDate}`,
        });
        return allocation;
      });
      if (!claim) { bump("claim_lost"); continue; }

      // Materialize the lead in the client org (outside the row transaction —
      // idempotent via allocation.leadId null-check on retries).
      const lu = j<LawfulUse | null>(record.dataset.lawfulUse, null);
      const created = await createLead({
        orgId: plan.orgId,
        leadType: plan.leadType as "b2b" | "b2c",
        input: j<LeadInput>(record.fields, {}),
        source: "allocation",
        sourceRef: claim.id,
        lawfulUse: lu ?? undefined,
        verify: false,
        demo: record.demo,
      });
      if (created.outcome !== "invalid") {
        await db.losAllocation.update({ where: { id: claim.id }, data: { leadId: created.leadId } });
        await db.losLead.update({ where: { id: created.leadId }, data: { qualityScore: record.qualityScore } }).catch(() => {});
      }
      allocated++;
    } catch {
      bump("error");
    }
  }

  const shortage = Math.max(0, due - allocated);
  await db.losAllocationRun.update({
    where: { id: run.id },
    data: { allocated, shortage, detail: JSON.stringify({ reasons, rollover, balanceBefore: balance }) },
  });
  await logLosAudit({
    orgId: plan.orgId, actorType: "system", action: "allocation.executed",
    entity: "LosAllocationRun", entityId: run.id, data: { runDate, due, allocated, shortage },
  });

  // Webhook delivery (fire-and-forget; failures logged in reasons only).
  if (plan.deliveryMethod === "webhook" && plan.webhookUrl && allocated > 0) {
    fetch(plan.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "leads.delivered", planId, runDate, count: allocated }),
    }).catch(() => {});
  }

  return { ...base, allocated, shortage, reasons, executed: true };
}

/** Called by the cron tick: enqueue an execution for every plan due this hour. */
export async function duePlanIds(now = new Date()): Promise<{ planId: string; runDate: string }[]> {
  const plans = await db.losLeadPlan.findMany({ where: { status: "active" }, select: { id: true, deliveryTimezone: true, deliveryHour: true } });
  const out: { planId: string; runDate: string }[] = [];
  for (const p of plans) {
    const { localHour } = await import("./allocationRules");
    if (localHour(p.deliveryTimezone, now) >= p.deliveryHour) {
      out.push({ planId: p.id, runDate: localDateStr(p.deliveryTimezone, now) });
    }
  }
  return out;
}
