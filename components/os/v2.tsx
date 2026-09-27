// Shared display pieces for the GrowthOS v2 pages (server-safe).
import Link from "next/link";
import { Badge } from "@/components/leados/ui";
import { human } from "./bits";

type Tone = "neutral" | "success" | "warn" | "danger" | "brand";
const TONE: Record<string, Tone> = {
  draft: "neutral", internal_qa: "warn", client_review: "warn", approved: "success", scheduled: "brand", published: "success", failed: "danger", needs_review: "danger", cancelled: "neutral",
  prospect: "neutral", discovery: "brand", proposal: "warn", accepted: "success", onboarding: "brand", active: "success", review: "warn", completed: "neutral", offboarded: "neutral", declined: "neutral",
  awaiting_client: "warn", blocked: "danger", paused: "neutral",
  not_invoiced: "neutral", invoiced: "warn", part_paid: "warn", paid: "success", overdue: "danger", refunded: "neutral", issued: "warn", void: "neutral",
  pending: "warn", available: "success", insufficient: "danger", disconnected: "danger", not_needed: "neutral", verified: "success", uncertain: "danger", partial: "danger", claimed: "brand",
  open: "brand", qualified: "brand", won: "success", lost: "neutral",
};
export function Pill({ value, label }: { value: string; label?: string }) {
  return <Badge tone={TONE[value] ?? "neutral"}>{label ?? human(value)}</Badge>;
}

/**
 * One component for every "nothing to show" situation, so each says WHY and WHAT NEXT:
 * empty (nothing yet), blocked (waiting on something), disconnected (account needed), error.
 */
export function Notice({ kind = "empty", title, children, href, action }: { kind?: "empty" | "blocked" | "disconnected" | "error" | "setup"; title: string; children?: React.ReactNode; href?: string; action?: string }) {
  const icon = { empty: "inbox", blocked: "block", disconnected: "link_off", error: "error", setup: "build" }[kind];
  const tone = kind === "error" || kind === "blocked" ? "text-[var(--los-danger)]" : kind === "disconnected" || kind === "setup" ? "text-[var(--los-warn)]" : "text-[var(--los-faint)]";
  return (
    <div role={kind === "error" ? "alert" : "status"} className="flex flex-col items-center gap-1 px-5 py-8 text-center">
      <span className={`material-symbols-outlined text-[26px] ${tone}`} aria-hidden>{icon}</span>
      <div className="text-[14px] font-semibold">{title}</div>
      {children && <div className="max-w-[460px] text-[13px] text-[var(--los-muted)]">{children}</div>}
      {href && action && <Link href={href} className="mt-2 rounded-lg border border-[var(--los-line)] px-3 py-1.5 text-[13px] font-semibold hover:bg-[var(--los-surface-2)]">{action}</Link>}
    </div>
  );
}

/** A number that may not exist. Missing is said in words — never rendered as 0. */
export function Figure({ label, value, unit, note, source }: { label: string; value: number | string | null | undefined; unit?: string; note?: string; source?: string }) {
  const missing = value === null || value === undefined;
  return (
    <div className="rounded-xl border border-[var(--los-line)] p-3">
      <div className="text-[12px] text-[var(--los-muted)]">{label}</div>
      <div className={missing ? "mt-1 text-[14px] font-semibold text-[var(--los-faint)]" : "mt-0.5 text-[22px] font-extrabold tracking-tight"}>
        {missing ? "Not available" : typeof value === "number" ? value.toLocaleString("en") : value}{!missing && unit ? <span className="ml-1 text-[12px] font-medium text-[var(--los-muted)]">{unit}</span> : null}
      </div>
      {(note || source) && <div className="mt-1 text-[11.5px] text-[var(--los-faint)]">{[source, note].filter(Boolean).join(" · ")}</div>}
    </div>
  );
}

export const money = (minor: bigint | number | null | undefined, currency: string | null | undefined): string | null =>
  minor === null || minor === undefined || !currency ? null : new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(minor) / 100);

export function Tabs({ items, active }: { items: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav aria-label="Sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-[var(--los-line)] text-[13.5px]">
      {items.map((t) => <Link key={t.key} href={t.href} aria-current={t.key === active ? "page" : undefined} className={`whitespace-nowrap border-b-2 px-3 py-2 font-medium ${t.key === active ? "border-[var(--los-brand)] text-[var(--los-fg)]" : "border-transparent text-[var(--los-muted)] hover:text-[var(--los-fg)]"}`}>{t.label}</Link>)}
    </nav>
  );
}
