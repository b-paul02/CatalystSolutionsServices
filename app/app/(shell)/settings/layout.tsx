import NavLink from "../NavLink";
import { requireOrg } from "@/lib/leados/auth";
import { can, type Permission } from "@/lib/leados/rbac";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  // Show only tabs the role can open (each page still guards itself). No workspace yet: the pages decide.
  const role = await requireOrg().then((a) => a.role, () => null);
  const tabs: { href: string; label: string; icon: string; exact?: boolean; anyOf?: Permission[] }[] = [
    { href: "/app/settings", label: "Organization", icon: "domain", exact: true },
    { href: "/app/settings/workspace", label: "Workspace", icon: "tune" },
    { href: "/app/settings/team", label: "Team", icon: "group_add" },
    { href: "/app/settings/security", label: "Security", icon: "lock" },
    { href: "/app/settings/notifications", label: "Notifications", icon: "notifications" },
    { href: "/app/settings/api-keys", label: "API keys", icon: "key" },
    { href: "/app/settings/billing", label: "Tokens & billing", icon: "toll", anyOf: ["org.billing"] },
    { href: "/app/settings/ai-credits", label: "AI credits", icon: "auto_awesome", anyOf: ["ai.use", "org.billing"] },
    { href: "/app/settings/scoring", label: "Scoring", icon: "speed", anyOf: ["reports.view"] },
    { href: "/app/settings/connections", label: "Connections", icon: "cable" },
  ];
  return (
    <div>
      <h1 className="mb-4 text-[22px] font-extrabold tracking-tight">Settings</h1>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--los-line)] pb-2">
        {tabs.filter((t) => !t.anyOf || !role || t.anyOf.some((p) => can(role, p))).map(({ anyOf: _, ...t }) => <NavLink key={t.href} {...t} />)}
      </div>
      <div className="max-w-[760px]">{children}</div>
    </div>
  );
}
