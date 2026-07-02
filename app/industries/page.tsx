import type { Metadata } from "next";
import Icon from "@/components/Icon";
import PageHero from "@/components/PageHero";
import CTASection from "@/components/CTASection";
import { industries } from "@/lib/content";

export const metadata: Metadata = { title: "Industries" };

export default function IndustriesPage() {
  return (
    <>
      <PageHero
        badge="Industries We Serve"
        title="Growth Systems Tailored to Your Industry"
        subtitle="Every market is different. We adapt strategy, channels, and execution to the realities of how your industry actually buys and grows."
      />
      <section className="px-5 pb-24 pt-10 sm:px-8">
        <div className="mx-auto grid max-w-[1240px] gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
          {industries.map((i) => (
            <div key={i.title} className="card-i">
              <span className="mb-[18px] flex h-[50px] w-[50px] items-center justify-center rounded-[13px] border border-[rgba(168,85,247,0.25)] bg-[linear-gradient(135deg,rgba(124,58,237,0.25),rgba(168,85,247,0.1))] text-[26px] text-[var(--color-brand-soft)]"><Icon name={i.icon} /></span>
              <h3 className="mb-2.5 text-lg font-semibold text-white">{i.title}</h3>
              <p className="text-sm leading-[1.6] text-[var(--color-faint)]">{i.desc}</p>
            </div>
          ))}
        </div>
      </section>
      <CTASection
        eyebrow="Built for your market"
        heading="Let's Build a Plan for Your Industry"
        copy="Tell us about your business and we'll map a growth approach suited to how your market actually works."
      />
    </>
  );
}
