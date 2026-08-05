import Link from "next/link";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "@/lib/audit/adminAuth";
import LogoutButton from "./LogoutButton";

export const metadata = { robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const email = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!email) return <>{children}</>; // login page — no chrome

  return (
    <>
      <div className="border-b border-[var(--color-line)] bg-[var(--color-bg-2)]">
        <div className="shell flex flex-wrap items-center justify-between gap-3 py-3">
          <nav className="flex items-center gap-5 text-[13.5px] font-medium">
            <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--color-brand-soft)]">Admin</span>
            <Link href="/admin/reviews" className="text-[var(--color-muted)] hover:text-white">Reviews</Link>
            <Link href="/admin/leads" className="text-[var(--color-muted)] hover:text-white">Leads</Link>
          </nav>
          <div className="flex items-center gap-4">
            <span className="text-[12.5px] text-[var(--color-faint)]">{email}</span>
            <LogoutButton />
          </div>
        </div>
      </div>
      {children}
    </>
  );
}
