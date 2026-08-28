import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icon";
import PageHero from "@/components/PageHero";
import CTASection from "@/components/CTASection";
import { useCases } from "@/lib/content";

export const metadata: Metadata = { title: "Use Cases" };

export default function UseCasesPage() {
  return (
    <>
      <PageHero
        badge="Use Cases"
        title="What Do You Want to Solve First?"
        subtitle="Start with the outcome you need most. Each begins with a focused plan and the right specialists to make it real."
      />
      <section className="px-5 pb-24 pt-10 sm:px-8">
        <div className="mx-auto grid max-w-[1240px] gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map((c) => (
            <Link key={c.title} href="/contact" className="card-i block">
              <span className="mb-4 flex h-[48px] w-[48px] items-center justify-center rounded-xl border border-[rgba(168,85,247,0.25)] bg-[linear-gradient(135deg,rgba(124,58,237,0.25),rgba(168,85,247,0.1))] text-[25px] text-[var(--color-brand-soft)]"><Icon name={c.icon} /></span>
              <h3 className="mb-[9px] text-[17px] font-semibold text-white">{c.title}</h3>
              <p className="mb-4 text-[13.5px] leading-[1.58] text-[var(--color-faint)]">{c.desc}</p>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-brand-soft)]">Start here <Icon name="arrow_forward" className="text-[16px]" /></span>
            </Link>
          ))}
        </div>
      </section>
      <CTASection
        eyebrow="Your goal, our plan"
        heading="Tell Us What You Want to Achieve"
        copy="Bring us the outcome you're chasing and we'll show you the fastest practical path to get there."
      />
    </>
  );
}
