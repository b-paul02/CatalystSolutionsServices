import { redirect } from "next/navigation";
import { db } from "@/lib/audit/db";
import { currentLosActor } from "@/lib/leados/auth";
import { cookies } from "next/headers";
import { entitlements } from "@/lib/os/entitlements";
import { can } from "@/lib/leados/rbac";
import type { ModuleKey } from "@/lib/os/catalog";
import LogoutButton from "./LogoutButton";
import NavLink from "./NavLink";
import OrgSwitcher from "./OrgSwitcher";
import { tokenBalance } from "@/lib/leados/tokens";

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

  // Nav is entitlement-driven (blueprint §1.2): a workspace sees only contracted
  // modules. `perm` hides areas the member's role can't open (freelancers).
  const ent = await entitlements(active.orgId);
  type Item = { href: string; label: string; icon: string; module: ModuleKey; perm?: Parameters<typeof can>[1]; badge?: number };
  const pendingApprovals = can(active.role, "work.view") ? await db.cosApproval.count({ where: { orgId: active.orgId, status: "requested" } }) : 0;
  // Grouped like a product sidebar: everyday items on top, then sections. A
  // section disappears when the workspace isn't entitled to anything in it.
  const groups: { title: string | null; items: Item[] }[] = [
    { title: null, items: [
      { href: "/app/dashboard", label: "Overview", icon: "space_dashboard", module: "overview" },
      { href: "/app/approvals", label: "Approvals", icon: "approval", module: "approvals", perm: "work.view", badge: pendingApprovals },
      { href: "/app/work", label: "Work", icon: "checklist", module: "overview" },
    ] },
    { title: "Growth engine", items: [
      { href: "/app/audit", label: "Growth Audit", icon: "fact_check", module: "audit", perm: "work.view" },
      { href: "/app/strategy", label: "Strategy", icon: "insights", module: "strategy", perm: "work.view" },
    ] },
    { title: "Automations", items: [
      { href: "/app/workflows", label: "Workflows", icon: "account_tree", module: "automations", perm: "work.view" },
    ] },
    { title: "Marketing", items: [
      { href: "/app/content", label: "Content", icon: "edit_calendar", module: "content", perm: "work.view" },
      { href: "/app/search", label: "Search", icon: "travel_explore", module: "search", perm: "work.view" },
      { href: "/app/ads", label: "Ads", icon: "ads_click", module: "ads", perm: "work.view" },
      { href: "/app/campaigns", label: "Lead capture", icon: "campaign", module: "crm", perm: "campaigns.view" },
    ] },
    { title: "Sales", items: [
      { href: "/app/leads", label: "Leads", icon: "group", module: "crm", perm: "leads.view" },
      { href: "/app/pipeline", label: "Pipeline", icon: "view_kanban", module: "crm", perm: "leads.view" },
      { href: "/app/tasks", label: "My day", icon: "today", module: "crm", perm: "leads.view" },
      { href: "/app/outreach", label: "Outreach", icon: "send", module: "crm", perm: "leads.contact" },
      { href: "/app/discover", label: "Discover", icon: "person_search", module: "lead_supply", perm: "leads.view" },
      { href: "/app/deliveries", label: "Deliveries", icon: "inventory", module: "lead_supply", perm: "leads.view" },
    ] },
    { title: "Intelligence", items: [
      { href: "/app/reports", label: "Reports", icon: "monitoring", module: "intelligence", perm: "reports.view" },
    ] },
  ];
  const visible = groups
    .map((g) => ({ ...g, items: g.items.filter((n) => ent.modules.has(n.module) && (!n.perm || can(active.role, n.perm))) }))
    .filter((g) => g.items.length > 0);
  const showCredits = ent.modules.has("lead_supply") && can(active.role, "org.billing");
  const credits = showCredits ? await tokenBalance(active.orgId) : 0;

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="flex items-center justify-between border-b border-[var(--los-line)] bg-[var(--los-surface)] px-4 py-2 md:w-[220px] md:flex-col md:items-stretch md:justify-start md:border-b-0 md:border-r md:px-3 md:py-4">
        <div className="flex items-center gap-2 md:mb-6 md:px-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--los-brand)] text-[13px] font-bold text-white">C</div>
          <div className="min-w-0">
            <div className="text-[14px] font-bold leading-tight">CatalystGrowthOS</div>
            <OrgSwitcher activeId={active.orgId} orgs={memberships.map((x) => ({ id: x.orgId, name: x.org.name }))} />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto md:flex-1 md:flex-col md:gap-0 md:overflow-y-auto">
          {visible.map((g) =>
            g.title === null ? (
              <div key="top" className="flex gap-1 md:mb-2 md:flex-col">{g.items.map((item) => <NavLink key={item.href} {...item} />)}</div>
            ) : (
              // native <details>: collapsible sections with no client JS
              <details key={g.title} open className="group contents md:mb-1 md:block">
                <summary className="hidden cursor-pointer list-none items-center gap-1 px-2.5 pb-1 pt-2 text-[11.5px] font-medium text-[var(--los-faint)] md:flex [&::-webkit-details-marker]:hidden">
                  {g.title}<span className="material-symbols-outlined text-[14px] transition-transform group-open:rotate-0 -rotate-90" aria-hidden>expand_more</span>
                </summary>
                <div className="flex gap-1 md:flex-col">{g.items.map((item) => <NavLink key={item.href} {...item} />)}</div>
              </details>
            ),
          )}
        </nav>
        <div className="hidden md:block">
          {showCredits && (
            <div className="mb-2 rounded-lg border border-[var(--los-line)] p-2.5">
              <div className="flex items-center justify-between text-[12px] text-[var(--los-muted)]"><span>Credits</span><span className="font-semibold text-[var(--los-fg)]">{credits.toLocaleString()}</span></div>
              <a href="/app/settings/billing" className="mt-2 block rounded-md bg-[var(--los-fg)] px-2 py-1.5 text-center text-[12px] font-semibold text-[var(--los-surface)]">Add credits</a>
            </div>
          )}
          <NavLink href="/app/settings" label="Settings" icon="settings" />
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--los-line)] px-2 pt-3">
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-medium">{actor.name ?? actor.email}</div>
              <div className="text-[11px] capitalize text-[var(--los-faint)]">{active.role.replace(/_/g, " ")}</div>
            </div>
            <LogoutButton />
          </div>
        </div>
        <div className="flex items-center gap-1 md:hidden"><NavLink href="/app/settings" label="" icon="settings" /><LogoutButton /></div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-6">
        {ent.killSwitch && (
          <div role="alert" className="mb-4 rounded-lg border border-[var(--los-danger)] px-4 py-2.5 text-[13px] font-medium text-[var(--los-danger)]">
            Kill switch is ON — publishing, sends and launches are blocked for this workspace. Turn it off in Settings → Workspace.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

