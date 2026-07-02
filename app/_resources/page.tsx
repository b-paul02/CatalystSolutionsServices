import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icon";
import PageHero from "@/components/PageHero";
import CTASection from "@/components/CTASection";
import { resourceCategories, posts } from "@/lib/content";

export const metadata: Metadata = { title: "Resources" };

export default function ResourcesPage() {
  return (
    <>
      <PageHero
        badge="Resources & Insights"
        title="Ideas to Help You Grow Smarter"
        subtitle="Practical thinking on strategy, AI, websites, search, ads, content, and the systems behind sustainable growth."
      />
      <section className="px-5 pb-10 pt-2 sm:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-wrap justify-center gap-2.5">
          {resourceCategories.map((c) => (
            <span key={c.name} className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(168,85,247,0.18)] bg-white/[0.04] px-4 py-[9px] text-[13px] font-medium text-[var(--color-brand-soft)] transition-colors hover:border-[rgba(168,85,247,0.5)] hover:bg-[rgba(124,58,237,0.12)]">
              <Icon name={c.icon} className="text-[16px]" />
              {c.name}
            </span>
          ))}
        </div>
      </section>
      <section className="px-5 pb-24 pt-4 sm:px-8">
        <div className="mx-auto grid max-w-[1240px] gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <Link key={p.title} href="/contact" className="card-i block overflow-hidden p-0">
              <div className="relative h-[130px] overflow-hidden" style={{ background: p.bg }}>
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:24px_24px]" />
                <Icon name={p.icon} className="absolute bottom-3 right-3.5 text-[40px] text-white/80" />
              </div>
              <div className="p-[22px]">
                <div className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-[#A78BCF]">{p.category}</div>
                <h3 className="mb-2.5 text-[16.5px] font-semibold leading-[1.34] text-white">{p.title}</h3>
                <p className="mb-3.5 text-[13px] leading-[1.55] text-[var(--color-faint)]">{p.excerpt}</p>
                <span className="text-xs text-[#6b6b7a]">{p.read}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <CTASection
        eyebrow="Beyond the blog"
        heading="Want a Plan Built for Your Business?"
        copy="Reading is a start. A short consultation turns these ideas into a roadmap tailored to your goals."
      />
    </>
  );
}
