import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icon";
import PageHero from "@/components/PageHero";
import CTASection from "@/components/CTASection";
import { studies } from "@/lib/content";

export const metadata: Metadata = { title: "Work" };

function Field({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[#6b6b7a]">{label}</div>
      <div className="text-sm leading-[1.55]" style={{ color }}>{value}</div>
    </div>
  );
}

export default function WorkPage() {
  return (
    <>
      <PageHero
        badge="Work & Case Studies"
        title="Growth Systems We Build"
        subtitle="Illustrative examples of how we approach common growth challenges. These are sample systems that show our methodology, not specific client results."
      />
      <section className="px-5 pb-24 pt-10 sm:px-8">
        <div className="mx-auto grid max-w-[1240px] gap-5 md:grid-cols-2">
          {studies.map((s) => (
            <div key={s.title} className="card-i overflow-hidden p-0">
              <div className="relative h-[160px] overflow-hidden" style={{ background: s.bg }}>
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:28px_28px]" />
                <span className="absolute left-4 top-4 rounded-md border border-white/15 bg-[rgba(5,5,10,0.6)] px-3 py-[5px] text-[11px] font-semibold text-[var(--color-brand-soft)]">{s.label}</span>
                <Icon name={s.icon} className="absolute bottom-3.5 right-[18px] text-[54px] text-white/85" />
              </div>
              <div className="p-7">
                <div className="mb-2.5 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-[#A78BCF]">{s.type}</div>
                <h3 className="mb-[18px] text-[21px] font-bold tracking-[-0.01em] text-white">{s.title}</h3>
                <div className="mb-[22px] flex flex-col gap-3.5">
                  <Field label="Challenge" value={s.challenge} color="#B8B8C6" />
                  <Field label="Solution" value={s.solution} color="#B8B8C6" />
                  <Field label="Outcome Area" value={s.outcome} color="#6EE7B7" />
                </div>
                <Link href="/contact" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--color-brand-soft)] hover:text-white">View Case Study <Icon name="arrow_forward" className="text-[16px]" /></Link>
              </div>
            </div>
          ))}
        </div>
      </section>
      <CTASection
        eyebrow="Your system, built right"
        heading="Let's Build Your Growth System"
        copy="Every engagement starts with understanding your goals. Let's map what a system like these could look like for you."
        button="Let's Build Your Growth System"
      />
    </>
  );
}
