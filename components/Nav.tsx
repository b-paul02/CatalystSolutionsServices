"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Icon from "./Icon";

const links = [
  { label: "Services", href: "/services" },
  { label: "Industries", href: "/industries" },
  { label: "Use Cases", href: "/use-cases" },
  // Proof lives on each program page now (demos, blueprint, samples sit beside the
  // pricing). /proof remains as a gallery, linked from the footer.
  { label: "Demo Sites", href: "/proof" },
  { label: "About", href: "/about" },
  { label: "Free Growth Audit", href: "/growth-audit" },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center" aria-label="Catalyst Solutions Services home">
      <Image src="/logo.png" alt="Catalyst Solutions Services" width={1462} height={425} priority className="h-14 w-auto" />
    </Link>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[rgba(168,85,247,0.12)] bg-[rgba(5,5,9,0.72)] backdrop-blur-[18px]">
      <div className="shell flex items-center justify-between py-3.5">
        <Logo />

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={`text-[13.5px] font-medium tracking-[-0.005em] transition-colors hover:text-white ${
                isActive(l.href) ? "text-[var(--color-brand-soft)]" : "text-[var(--color-muted)]"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/contact" className="hidden items-center gap-1.5 rounded-[9px] border border-white/15 bg-gradient-to-br from-[#7C3AED] to-[#A855F7] px-[18px] py-2.5 text-[13.5px] font-semibold text-white shadow-[0_0_22px_rgba(124,58,237,0.45)] transition-shadow hover:shadow-[0_0_30px_rgba(168,85,247,0.7)] sm:inline-flex">
            Book a Call <Icon name="arrow_forward" className="text-[17px]" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 text-white lg:hidden"
          >
            <Icon name={open ? "close" : "menu"} className="text-[22px]" />
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-white/10 bg-[rgba(5,5,9,0.96)] px-5 pb-4 lg:hidden" aria-label="Mobile">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`block border-b border-white/5 py-3 text-[15px] font-medium ${
                isActive(l.href) ? "text-[var(--color-brand-soft)]" : "text-[var(--color-muted)]"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <Link href="/contact" onClick={() => setOpen(false)} className="btn-primary mt-4 w-full">
            Book a Call <Icon name="arrow_forward" className="text-[18px]" />
          </Link>
        </nav>
      )}
    </header>
  );
}
