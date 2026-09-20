"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({ href, label, icon, exact = false, badge }: { href: string; label: string; icon: string; exact?: boolean; badge?: number }) {
  const pathname = usePathname();
  const active = pathname === href || (!exact && pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      className={`flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium transition-colors ${
        active
          ? "bg-[var(--los-brand-soft)] text-[var(--los-brand)]"
          : "text-[var(--los-muted)] hover:bg-[var(--los-surface-2)] hover:text-[var(--los-fg)]"
      }`}
    >
      <span className="material-symbols-outlined text-[19px]" aria-hidden>{icon}</span>
      <span className="flex-1">{label}</span>
      {badge ? <span className="rounded-full bg-[var(--los-danger)] px-1.5 text-[10.5px] font-bold leading-[16px] text-white">{badge > 9 ? "9+" : badge}</span> : null}
    </Link>
  );
}
