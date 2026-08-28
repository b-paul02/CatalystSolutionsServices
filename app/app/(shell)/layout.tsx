import { redirect } from "next/navigation";
import { db } from "@/lib/audit/db";
import { currentLosActor } from "@/lib/leados/auth";
import { cookies } from "next/headers";
import LogoutButton from "./LogoutButton";
import NavLink from "./NavLink";

// Signed-in shell: left sidebar (desktop) / top bar (mobile). Guards here are
// convenience only — every action and route handler re-checks authorization.
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentLosActor();
  if (!actor) redirect("/app/login");
  if (actor.mfaPending) redirect("/app/mfa");
  const memberships = await db.losMembership.findMany({
    where: { userId: actor.userId, org: { status: "active" } },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) redirect("/app/onboarding");
  const preferred = (await cookies()).get("los_org")?.value;
  const active = memberships.find((m) => m.orgId === preferred) ?? memberships[0];

  const nav = [
    { href: "/app/dashboard", label: "Dashboard", icon: "space_dashboard" },
    { href: "/app/leads", label: "Leads", icon: "group" },
    { href: "/app/discover", label: "Discover", icon: "person_search" },
    { href: "/app/pipeline", label: "Pipeline", icon: "view_kanban" },
    { href: "/app/tasks", label: "My day", icon: "checklist" },
    { href: "/app/outreach", label: "Outreach", icon: "send" },
    { href: "/app/campaigns", label: "Campaigns", icon: "campaign" },
    { href: "/app/deliveries", label: "Deliveries", icon: "inventory" },
    { href: "/app/reports", label: "Reports", icon: "monitoring" },
    { href: "/app/settings", label: "Settings", icon: "settings" },
  ];

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="flex items-center justify-between border-b border-[var(--los-line)] bg-[var(--los-surface)] px-4 py-2 md:w-[220px] md:flex-col md:items-stretch md:justify-start md:border-b-0 md:border-r md:px-3 md:py-4">
        <div className="flex items-center gap-2 md:mb-6 md:px-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--los-brand)] text-[13px] font-bold text-white">L</div>
          <div className="min-w-0">
            <div className="text-[14px] font-bold leading-tight">LeadOS</div>
            <div className="truncate text-[11.5px] text-[var(--los-faint)]">{active.org.name}</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto md:flex-1 md:flex-col md:overflow-visible">
          {nav.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
          ))}
        </nav>
        <div className="hidden items-center justify-between gap-2 border-t border-[var(--los-line)] pt-3 md:flex md:px-2">
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-medium">{actor.name ?? actor.email}</div>
            <div className="text-[11px] capitalize text-[var(--los-faint)]">{active.role.replace(/_/g, " ")}</div>
          </div>
          <LogoutButton />
        </div>
        <div className="md:hidden"><LogoutButton /></div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-6">{children}</main>
    </div>
  );
}

