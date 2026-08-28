import NavLink from "../NavLink";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const tabs = [
    { href: "/app/settings", label: "Organization", icon: "domain", exact: true },
    { href: "/app/settings/team", label: "Team", icon: "group_add" },
    { href: "/app/settings/security", label: "Security", icon: "lock" },
    { href: "/app/settings/api-keys", label: "API keys", icon: "key" },
    { href: "/app/settings/billing", label: "Tokens & billing", icon: "toll" },
    { href: "/app/settings/scoring", label: "Scoring", icon: "speed" },
    { href: "/app/settings/integrations", label: "Integrations", icon: "cable" },
  ];
  return (
    <div>
      <h1 className="mb-4 text-[22px] font-extrabold tracking-tight">Settings</h1>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--los-line)] pb-2">
        {tabs.map((t) => <NavLink key={t.href} {...t} />)}
      </div>
      <div className="max-w-[760px]">{children}</div>
    </div>
  );
}
