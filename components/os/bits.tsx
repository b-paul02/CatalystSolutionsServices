// Small server-safe display helpers shared by the OS pages.
import { Badge } from "@/components/leados/ui";

type Tone = "neutral" | "success" | "warn" | "danger" | "brand";

const STATE_TONE: Record<string, Tone> = {
  backlog: "neutral", scoped: "neutral", ready: "brand", in_progress: "brand", internal_qa: "warn", client_review: "warn",
  approved: "success", scheduled: "success", delivered: "success", verified: "success", closed: "neutral",
  blocked: "danger", revision_requested: "warn", failed: "danger", cancelled: "neutral",
};
export const human = (s: string) => s.replace(/_/g, " ");

export function StateBadge({ state }: { state: string }) {
  return <Badge tone={STATE_TONE[state] ?? "neutral"}>{human(state)}</Badge>;
}

// Evidence confidence — observation vs inference is always visible (§1.2).
const LABEL_TONE: Record<string, Tone> = { verified: "success", measured: "success", detected: "brand", estimated: "warn", assumed: "warn", unavailable: "neutral", self_reported: "warn" };
export function EvidenceBadge({ label }: { label: string }) {
  return <Badge tone={LABEL_TONE[label] ?? "neutral"}>{label}</Badge>;
}

const TIER_LABEL = ["T0 read", "T1 internal", "T2 publish/contact", "T3 money/release"];
export function TierBadge({ tier }: { tier: number }) {
  return <Badge tone={tier >= 3 ? "danger" : tier === 2 ? "warn" : "neutral"}>{TIER_LABEL[tier] ?? `T${tier}`}</Badge>;
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-[13.5px] text-[var(--los-muted)]">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-8 text-center text-[13.5px] text-[var(--los-faint)]">{children}</div>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">{children}</div>;
}

export const field = "w-full rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-3 py-2 text-[13.5px]";
export const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "—");
