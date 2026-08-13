import type { Metadata } from "next";
import Icon from "@/components/Icon";
import DoctorWizard from "./DoctorWizard";

// Unlisted tool: not in nav, footer, or sitemap; noindex keeps it out of search.
export const metadata: Metadata = {
  title: "Doctor Digital Presence Audit",
  robots: { index: false, follow: false },
};

const points = [
  { icon: "clinical_notes", title: "Built for doctors", desc: "Questions about your practice, patients, Google presence, and professional brand — 3–5 minutes." },
  { icon: "travel_explore", title: "Real checks, not opinions", desc: "If you share your website, we run an automated technical scan and report what we actually measured." },
  { icon: "person_check", title: "Reviewed by a consultant", desc: "Every audit is checked and approved by a Catalyst consultant before release. Ready within 1 business day." },
];

export default function DoctorAuditPage() {
  return (
    <>
      <section className="relative overflow-hidden px-5 pb-16 pt-20 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_10%,rgba(124,58,237,0.25),transparent_60%)]" />
        <div className="relative mx-auto max-w-[720px] text-center">
          <span className="badge mb-6"><span className="badge-dot anim-pulse" />For medical professionals · Complimentary · Confidential</span>
          <h1 className="mb-5 text-[clamp(2rem,5.5vw,46px)] font-extrabold leading-[1.08] tracking-[-0.03em] text-white">
            Your Professional{" "}
            <span className="bg-gradient-to-r from-[#A855F7] via-[#C4B5FD] to-[#60A5FA] bg-clip-text text-transparent">Digital Presence Audit</span>
          </h1>
          <p className="mx-auto mb-10 max-w-[540px] text-[16.5px] leading-[1.62] text-[var(--color-muted)]">
            A focused review of how patients find you online: your search presence, Google profile,
            website, and appointment journey — with practical opportunities, not a sales pitch.
          </p>
        </div>
        <div className="relative"><DoctorWizard /></div>
      </section>

      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto grid max-w-[900px] gap-[18px] sm:grid-cols-3">
          {points.map((p) => (
            <div key={p.title} className="card-i">
              <span className="icon-chip mb-4 h-11 w-11 text-[23px]"><Icon name={p.icon} /></span>
              <h3 className="mb-[7px] text-[15.5px] font-semibold text-white">{p.title}</h3>
              <p className="text-[13px] leading-[1.55] text-[var(--color-faint)]">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
