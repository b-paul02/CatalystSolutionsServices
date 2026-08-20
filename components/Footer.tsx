import Link from "next/link";
import Image from "next/image";
import Icon from "./Icon";
import MarketSwitcher from "./MarketSwitcher";

const cols = [
  {
    title: "Company",
    items: [
      { label: "About", href: "/about" },
      { label: "Industries", href: "/industries" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Services",
    items: [
      { label: "AI Strategy & Consulting", href: "/services/ai-strategy" },
      { label: "Website Design & Dev", href: "/services/website" },
      { label: "SEO & AI Search", href: "/services/seo" },
      { label: "AI Automation", href: "/services/automation" },
      { label: "All Services", href: "/services" },
    ],
  },
  {
    title: "Explore",
    items: [
      { label: "Use Cases", href: "/use-cases" },
      { label: "Proof & Demos", href: "/proof" },
      { label: "Add-Ons & Partnerships", href: "/add-ons" },
      { label: "Free Growth Audit", href: "/growth-audit" },
      { label: "Book a Call", href: "/contact" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative w-full overflow-hidden border-t border-[rgba(168,85,247,0.12)] bg-[var(--color-bg-2)]">
      <div className="pointer-events-none absolute -top-[120px] left-1/2 h-[300px] w-[600px] -translate-x-1/2 bg-[radial-gradient(ellipse,rgba(124,58,237,0.18),transparent_70%)]" />
      <div className="shell relative pb-9 pt-16">
        <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="mb-[18px] flex items-center" aria-label="Catalyst Solutions Services home">
              <Image src="/logo.png" alt="Catalyst Solutions Services" width={1462} height={425} className="h-16 w-auto" />
            </Link>
            <p className="mb-[18px] max-w-[300px] text-[13.5px] leading-[1.65] text-[var(--color-faint)]">
              An AI-enabled digital growth partner helping businesses build, market, automate, and scale through strategy and execution.
            </p>
            <div className="grid gap-2.5">
              <a
                href="mailto:info@catalystsolutionservices.com"
                className="group flex items-center gap-2.5 text-[13px] text-[var(--color-muted)] hover:text-white"
              >
                <span className="icon-chip h-7 w-7 shrink-0 text-[15px] transition group-hover:border-[var(--color-brand-soft)]">
                  <Icon name="mail" />
                </span>
                info@catalystsolutionservices.com
              </a>
              <address className="flex items-start gap-2.5 not-italic text-[13px] leading-[1.6] text-[var(--color-muted)]">
                <span className="icon-chip h-7 w-7 shrink-0 text-[15px]">
                  <Icon name="location_on" />
                </span>
                <span>
                  1309 Coffeen Avenue STE 1200
                  <br />
                  Sheridan, Wyoming 82801
                </span>
              </address>
            </div>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <div className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-brand-soft)]">{c.title}</div>
              <div className="flex flex-col gap-[11px]">
                {c.items.map((i) => (
                  <Link key={i.label} href={i.href} className="text-[13.5px] text-[var(--color-faint)] hover:text-white">
                    {i.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-white/5 pt-6 text-[12.5px] text-[#6b6b7a] sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Catalyst Solutions Services. All rights reserved.</span>
          <span className="flex flex-wrap items-center gap-4">
            <MarketSwitcher />
            <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
            <span>catalystsolutionservices.com</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
