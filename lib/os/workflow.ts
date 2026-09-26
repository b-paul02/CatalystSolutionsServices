// Pure state machines and policy for CatalystGrowthOS (blueprint §9). No DB, no
// IO — everything here is exhaustively unit-tested in tests/os/workflow.test.ts.
import { createHash } from "node:crypto";

// ── work item ────────────────────────────────────────────────────────────────

export const WORK_STATES = [
  "backlog", "scoped", "ready", "in_progress", "internal_qa", "client_review",
  "approved", "scheduled", "delivered", "verified", "closed",
  "blocked", "revision_requested", "failed", "cancelled",
] as const;
export type WorkState = (typeof WORK_STATES)[number];

export const TERMINAL_STATES: readonly WorkState[] = ["closed", "cancelled"];
export const OPEN_STATES = WORK_STATES.filter((s) => !TERMINAL_STATES.includes(s));

// Who may perform a transition. "approval" = only the approval engine, never a
// direct state change — that is what makes client sign-off un-bypassable.
export type Capability = "manage" | "execute" | "review" | "approval" | "system";

const T: Record<string, Capability> = {
  "backlog>scoped": "manage",
  "scoped>ready": "manage",
  "scoped>backlog": "manage",
  "ready>in_progress": "execute",
  "in_progress>internal_qa": "execute",
  "internal_qa>client_review": "review",
  "internal_qa>approved": "review", // only when clientReviewRequired=false (checked in canTransition)
  "internal_qa>revision_requested": "review",
  "client_review>approved": "approval",
  "client_review>revision_requested": "approval",
  "revision_requested>in_progress": "execute",
  "approved>scheduled": "execute",
  "approved>delivered": "execute",
  "scheduled>delivered": "execute",
  "scheduled>failed": "execute",
  "scheduled>approved": "execute", // un-schedule
  "failed>in_progress": "execute",
  "failed>scheduled": "execute",
  "delivered>verified": "review",
  "delivered>revision_requested": "review",
  "verified>closed": "manage",
};

export type TransitionCheck = { ok: true; capability: Capability } | { ok: false; reason: string };

export function canTransition(
  from: string,
  to: string,
  item: { clientReviewRequired: boolean; stateBefore?: string | null },
): TransitionCheck {
  if (!(WORK_STATES as readonly string[]).includes(from) || !(WORK_STATES as readonly string[]).includes(to)) {
    return { ok: false, reason: "Unknown state." };
  }
  if (TERMINAL_STATES.includes(from as WorkState)) return { ok: false, reason: "Item is closed." };
  if (to === "cancelled") return { ok: true, capability: "manage" };
  if (to === "blocked") return from === "blocked" ? { ok: false, reason: "Already blocked." } : { ok: true, capability: "execute" };
  if (from === "blocked") {
    return to === (item.stateBefore ?? "backlog")
      ? { ok: true, capability: "execute" }
      : { ok: false, reason: "A blocked item returns to the state it was blocked from." };
  }
  const capability = T[`${from}>${to}`];
  if (!capability) return { ok: false, reason: `Cannot move from ${from} to ${to}.` };
  if (from === "internal_qa" && to === "approved" && item.clientReviewRequired) {
    return { ok: false, reason: "Client review is required for this item." };
  }
  if (from === "internal_qa" && to === "client_review" && !item.clientReviewRequired) {
    return { ok: false, reason: "This item does not need client review." };
  }
  return { ok: true, capability };
}

/** States reachable from `from` for someone holding `caps` (UI helper). */
export function nextStates(from: string, item: { clientReviewRequired: boolean; stateBefore?: string | null }, caps: Capability[]): WorkState[] {
  return WORK_STATES.filter((to) => {
    const c = canTransition(from, to, item);
    return c.ok && caps.includes(c.capability);
  });
}

// ── approvals ────────────────────────────────────────────────────────────────

export const APPROVAL_STATES = ["requested", "approved", "approved_with_edits", "rejected", "expired", "revoked"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

export function canDecideApproval(from: string, to: string): boolean {
  if (from === "requested") return ["approved", "approved_with_edits", "rejected", "expired", "revoked"].includes(to);
  if (from === "approved" || from === "approved_with_edits") return to === "revoked";
  return false;
}

/** Hash the approvable content. Any material change → new hash → old approvals are void. */
export function contentHash(title: string, payload: string | null | undefined): string {
  return createHash("sha256").update(JSON.stringify([title, payload ?? ""])).digest("hex");
}

// ── recommendation / finding ─────────────────────────────────────────────────

export const FINDING_STATES = ["identified", "evidence_checked", "proposed", "accepted", "deferred", "rejected", "archived"] as const;
export type FindingState = (typeof FINDING_STATES)[number];

const F: Record<string, readonly string[]> = {
  identified: ["evidence_checked", "archived"],
  evidence_checked: ["proposed", "archived"],
  proposed: ["accepted", "deferred", "rejected"],
  deferred: ["proposed", "archived"],
  accepted: [],
  rejected: ["archived"],
  archived: [],
};
export const canMoveFinding = (from: string, to: string): boolean => (F[from] ?? []).includes(to);

export const EVIDENCE_LABELS = ["verified", "detected", "assumed", "unavailable"] as const;
export type EvidenceLabel = (typeof EVIDENCE_LABELS)[number];

// ── autonomy policy (§9.3) ───────────────────────────────────────────────────

export type ActionGate = { allowed: true } | { allowed: false; reason: string };

/**
 * The single gate every external action passes through immediately before it
 * runs. Tier 0/1 are internal. Tier 2 needs a CURRENT approval (hash match)
 * unless the org explicitly enabled autonomy for that action type. Tier 3 always
 * needs a current named approval — autonomy can never cover it.
 */
export function gateAction(opts: {
  tier: number;
  killSwitch: boolean;
  currentHash: string;
  approval: { status: string; contentHash: string; expiresAt?: Date | null } | null;
  autonomyEnabled?: boolean;
  /** WP-06 feature flag (lib/os/flags.ts): false = the feature is switched off by the operator */
  featureEnabled?: boolean;
  now?: Date;
}): ActionGate {
  const now = opts.now ?? new Date();
  if (opts.tier >= 2 && opts.killSwitch) return { allowed: false, reason: "Kill switch is on for this workspace." };
  if (opts.featureEnabled === false) return { allowed: false, reason: "This feature is switched off by the Catalyst team at the moment." };
  if (opts.tier <= 1) return { allowed: true };
  if (opts.tier === 2 && opts.autonomyEnabled) return { allowed: true };
  const a = opts.approval;
  if (!a) return { allowed: false, reason: "No approval on record." };
  if (a.status !== "approved" && a.status !== "approved_with_edits") return { allowed: false, reason: `Approval is ${a.status}.` };
  if (a.contentHash !== opts.currentHash) return { allowed: false, reason: "Content changed after approval — re-approval required." };
  if (a.expiresAt && a.expiresAt < now) return { allowed: false, reason: "Approval expired." };
  return { allowed: true };
}

// ── plan change control (§6.1) ───────────────────────────────────────────────

export type Allocation = { channel: string; pct: number };

/** Channel-level diff; any move ≥ thresholdPts (default 5) is material → review. */
export function allocationDiff(current: Allocation[], proposed: Allocation[], thresholdPts = 5) {
  const channels = [...new Set([...current, ...proposed].map((a) => a.channel))];
  const rows = channels.map((channel) => {
    const from = current.find((a) => a.channel === channel)?.pct ?? 0;
    const to = proposed.find((a) => a.channel === channel)?.pct ?? 0;
    return { channel, from, to, delta: to - from, material: Math.abs(to - from) >= thresholdPts };
  });
  return { rows, material: rows.some((r) => r.material) };
}

// ── attribution grades (§7.2) — proposed operational criteria ────────────────

export type Grade = "A" | "B" | "C" | "D";
export function attributionGrade(t: { firstPartyEvent: boolean; knownIdentity: boolean; traceableSource: boolean; reconciledRevenue: boolean }): Grade {
  if (t.firstPartyEvent && t.knownIdentity && t.traceableSource && t.reconciledRevenue) return "A";
  if (t.knownIdentity && t.traceableSource) return "B";
  if (t.knownIdentity || t.traceableSource) return "C";
  return "D";
}
/** Only A/B facts may back measured-performance claims or drive replans. */
export const gradeIsDecisionReady = (g: string | null | undefined): boolean => g === "A" || g === "B";
