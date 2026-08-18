import Link from "next/link";
import Icon from "@/components/Icon";
import Market from "@/components/Market";
import { isBookable, maintenanceNote, type Tier } from "@/lib/programs";
import type { ProofLink } from "@/lib/proof";

// Tier pricing card shared by /bundles/[slug] (geo-based market, proof links)
// and /plans/[token] (fixed market, no proof). `market` set = render that
// market's price directly; unset = geo-resolved <Market> as before.
export default function TierCard({
  tier,
  featured,
  bookHref,
  proof = [],
  market,
  upfrontPct = 50,
}: {
  tier: Tier;
  featured: boolean;
  bookHref: string;
  proof?: ProofLink[];
  market?: "in" | "us";
  upfrontPct?: 50 | 100;
}) {
  const price = (m: { in: string; us: string }) => (market ? m[market] : <Market in={m.in} us={m.us} />);
  return (
    <div
      className={`flex flex-col rounded-2xl border p-[26px] ${
        featured
          ? "border-[rgba(168,85,247,0.5)] bg-[linear-gradient(160deg,rgba(40,25,75,0.85),rgba(14,11,26,0.85))] shadow-[0_0_40px_rgba(124,58,237,0.2)]"
          : "border-[var(--color-line)] bg-[linear-gradient(160deg,rgba(24,19,42,0.6),rgba(12,11,22,0.6))]"
      }`}
    >
      <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.09em] text-[var(--color-brand-soft)]">{tier.label}</div>
      <h3 className="mb-1.5 text-[19px] font-bold text-white">{tier.name}</h3>
      <p className="mb-5 text-[13.5px] leading-[1.55] text-[var(--color-muted)]">{tier.positioning}</p>

      {/* Pricing — onboarding is the tier price; monthly maintenance is priced but optional */}
      <div className="mb-5 rounded-xl border border-[rgba(168,85,247,0.2)] bg-[rgba(124,58,237,0.08)] p-4">
        {tier.setup ? (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] text-[var(--color-faint)]">{tier.setupLabel ?? "Onboarding"}</span>
            <span className="text-[17px] font-bold text-white">{price(tier.setup)}</span>
          </div>
        ) : (
          <div className="text-[13px] font-semibold text-white">Monthly plan — priced on your call</div>
        )}
        {tier.setup && tier.monthly && (
          <div className="mt-2 border-t border-white/5 pt-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--color-faint)]">
                <Icon name="autorenew" className="text-[14px] text-[var(--color-brand-soft)]" />
                Monthly maintenance <span className="text-[11.5px]">(optional)</span>
              </span>
              <span className="text-[13.5px] font-semibold text-[var(--color-brand-soft)]">{price(tier.monthly)}</span>
            </div>
            <div className="mt-1 text-[11.5px] leading-[1.45] text-[var(--color-faint)]">{maintenanceNote}</div>
          </div>
        )}
        {tier.qualifier && (
          <div className="mt-2 border-t border-white/5 pt-2 text-right text-[12.5px] font-medium text-[#FBBF24]">
            Qualifier: {price(tier.qualifier)}
          </div>
        )}
        {tier.priceNote && <div className="mt-2 border-t border-white/5 pt-2 text-[12px] leading-[1.5] text-[var(--color-faint)]">{tier.priceNote}</div>}
        {tier.setup && (
          <div className="mt-2 border-t border-white/5 pt-2 text-[11.5px] leading-[1.45] text-[var(--color-faint)]">
            Prices are exclusive of taxes and payment processing charges.
          </div>
        )}
      </div>

      {isBookable(tier) ? (
        <Link href={bookHref} className="btn-primary mb-5 w-full justify-center text-[14px]">
          Book Now — {upfrontPct === 100 ? "pay in full" : "pay 50% to start"} <Icon name="arrow_forward" className="text-[17px]" />
        </Link>
      ) : (
        <Link href="/contact" className="btn-ghost mb-5 w-full justify-center text-[14px]">Book a Call</Link>
      )}

      <p className="mb-4 text-[13px] leading-[1.55] text-[var(--color-faint)]"><span className="font-semibold text-[var(--color-fg)]">Who it's for: </span>{tier.whoFor}</p>

      {tier.deliverables && (
        <div className="mb-4">
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-fg)]">
            {tier.includesPrior ? "Everything in the previous tier, plus:" : "What's included"}
          </div>
          <ul className="flex flex-col gap-[7px]">
            {tier.deliverables.map((d) => (
              <li key={d} className="flex items-start gap-2 text-[13px] leading-[1.5] text-[var(--color-muted)]">
                <span className="mt-[3px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[5px] bg-[rgba(52,211,153,0.14)] text-[#6EE7B7]"><Icon name="check" className="text-[12px]" /></span>
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!tier.deliverables && tier.includesPrior && (
        <div className="mb-4 text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-fg)]">Everything in the previous tier, plus expanded scope:</div>
      )}

      <div className="border-t border-white/5 pt-4">
        <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-faint)]">Scope</div>
        <div className="flex flex-wrap gap-1.5">
          {tier.guardrails.map((g) => (
            <span key={g} className="rounded-full border border-[var(--color-line)] bg-white/[0.03] px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-muted)]">{g}</span>
          ))}
        </div>
      </div>

      {/* Proof for THIS tier — the demo site at this tier, the demo behind it, and
          the document you'd receive. Each tier's proof genuinely differs. */}
      {proof.length > 0 && (
        <div className="mt-auto border-t border-white/5 pt-4">
          <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-brand-soft)]">
            <Icon name="visibility" className="text-[14px]" />
            See this tier before you buy
          </div>
          <div className="flex flex-col gap-1.5">
            {proof.map((p) => (
              <Link
                key={p.href + p.label}
                href={p.href}
                title={p.desc}
                className="group flex items-center gap-2 text-[12.5px] leading-[1.45] text-[var(--color-muted)] hover:text-white"
              >
                <Icon name={p.icon} className="shrink-0 text-[15px] text-[var(--color-brand-soft)]" />
                <span className="underline decoration-white/20 underline-offset-2 group-hover:decoration-white/60">{p.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
