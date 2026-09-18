import { requireOrg } from "@/lib/leados/auth";
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { entitlements } from "@/lib/os/entitlements";
import { MODULES, serviceBySlug } from "@/lib/os/catalog";
import { programs } from "@/lib/programs";
import { Badge, Card, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { day, field } from "@/components/os/bits";
import { PROVIDERS, providerDef, providerEnabled } from "@/lib/os/connectors";
import { connectionAction, saveBrandProfile, setKillSwitch } from "../../_os/actions";

export const metadata = { title: "Workspace" };

// Control plane (blueprint §4.1): contracted scope, brand knowledge, connections
// and the kill switch.
export default async function WorkspaceSettingsPage() {
  const actor = await requireOrg();
  const [ws, ent, contracts, connections] = await Promise.all([
    db.cosWorkspace.findUnique({ where: { orgId: actor.orgId } }),
    entitlements(actor.orgId),
    db.cosContract.findMany({ where: { orgId: actor.orgId, status: { in: ["active", "ended"] } }, orderBy: { signedAt: "desc" } }),
    db.cosConnection.findMany({ where: { orgId: actor.orgId } }),
  ]);
  const brand: Record<string, string> = ws?.brandProfile ? JSON.parse(ws.brandProfile) : {};
  const settings = can(actor.role, "os.settings");
  const fields: [string, string][] = [
    ["voice", "Voice & tone"], ["audience", "Audience / ICP"], ["offers", "Offers & positioning"],
    ["proofPoints", "Real proof points (only what we can evidence)"], ["dos", "Always"], ["donts", "Never"], ["competitors", "Competitors"],
  ];

  return (
    <div className="space-y-6">
      <Card className="p-5 text-[13.5px]">
        <div className="mb-2 text-[15px] font-bold">Scope</div>
        <div className="mb-2 flex flex-wrap gap-1">{[...ent.modules].map((m) => <Badge key={m} tone="brand">{MODULES[m].label}</Badge>)}</div>
        {contracts.map((c) => (
          <div key={c.id} className="mt-2 border-t border-[var(--los-line)] pt-2">
            <div className="font-medium">{programs.find((p) => p.slug === c.programSlug)?.name ?? c.kind}{c.tier ? ` · ${c.tier}` : ""} <span className="text-[12px] font-normal text-[var(--los-faint)]">· {c.status} · signed {day(c.signedAt)}</span></div>
            <div className="text-[12.5px] text-[var(--los-muted)]">{(JSON.parse(c.services) as string[]).map((s) => serviceBySlug[s]?.title ?? s).join(" · ")}</div>
            {c.exclusions && <div className="text-[12px] text-[var(--los-faint)]">Not included: {c.exclusions}</div>}
          </div>
        ))}
        {contracts.length === 0 && <p className="text-[var(--los-muted)]">{ent.kind === "legacy" ? "Lead workspace — CRM and lead supply are on." : "No signed contract yet."}</p>}
      </Card>

      <Card className="p-5">
        <div className="mb-1 text-[15px] font-bold">Brand profile</div>
        <p className="mb-3 text-[13px] text-[var(--los-muted)]">Every AI draft in this workspace is grounded in this. Keep it factual — the model is told to invent nothing.</p>
        {settings ? (
          <ActionForm action={saveBrandProfile} submit="Save" className="grid gap-3 text-[13.5px]">
            {fields.map(([k, label]) => <div key={k}><Label>{label}</Label><textarea name={k} rows={2} defaultValue={brand[k] ?? ""} className={field} /></div>)}
          </ActionForm>
        ) : (
          <dl className="grid gap-2 text-[13.5px]">{fields.map(([k, label]) => <div key={k}><dt className="text-[12px] text-[var(--los-faint)]">{label}</dt><dd>{brand[k] || "—"}</dd></div>)}</dl>
        )}
      </Card>

      <Card className="p-5 text-[13.5px]">
        <div className="mb-1 text-[15px] font-bold">Connections</div>
        <p className="mb-3 text-[13px] text-[var(--los-muted)]">&quot;Verified&quot; means a live access test passed — never just a stored token. Disconnecting destroys the stored tokens.</p>
        {PROVIDERS.map((p) => {
          const def = providerDef(p);
          const c = connections.find((x) => x.provider === p);
          const live = c && c.status !== "disconnected";
          return (
            <div key={p} className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--los-line)] py-2.5">
              <div className="min-w-0">
                <div className="font-medium">{def.label} {live && <Badge tone={c.status === "verified" ? "success" : "danger"}>{c.status}</Badge>}</div>
                <div className="text-[12.5px] text-[var(--los-muted)]">{live && c.accountLabel ? `${c.accountLabel} · ` : ""}{def.capability}</div>
                {live && <div className="text-[12px] text-[var(--los-faint)]">checked {day(c.lastCheckedAt)}{c.lastError ? ` · ${c.lastError}` : ""}</div>}
              </div>
              {settings && (
                <div className="flex items-center gap-2">
                  {def.comingSoon ? <Badge>Coming soon</Badge>
                    : !providerEnabled(p) ? <span className="text-[12px] text-[var(--los-faint)]">not configured on this server</span>
                    : !live ? <a href={`/api/os/connect/${p}/start`} className="rounded-lg bg-[var(--los-brand)] px-3 py-1.5 text-[13px] font-semibold text-white">Connect</a>
                    : <>
                        {p === "gsc" && c.status === "verified" && <ActionForm action={connectionAction} submit="Sync now" tone="ghost" hidden={{ provider: p, op: "sync" }} />}
                        <ActionForm action={connectionAction} submit="Test" tone="ghost" hidden={{ provider: p, op: "test" }} />
                        <ActionForm action={connectionAction} submit="Disconnect" tone="danger" hidden={{ provider: p, op: "disconnect" }} confirm={`Disconnect ${def.label}?`} />
                      </>}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <Card className="border-[var(--los-danger)] p-5 text-[13.5px]">
        <div className="mb-1 text-[15px] font-bold">Kill switch</div>
        <p className="mb-3 text-[13px] text-[var(--los-muted)]">Blocks every publish, send and launch for this workspace immediately. Queued items stay put; anything already scheduled is listed for manual reconciliation.</p>
        <div className="flex items-center gap-3">
          <Badge tone={ent.killSwitch ? "danger" : "success"}>{ent.killSwitch ? "ON — outbound blocked" : "off"}</Badge>
          {ent.killSwitch && ws?.killSwitchAt && <span className="text-[12px] text-[var(--los-faint)]">since {ws.killSwitchAt.toISOString().slice(0, 16).replace("T", " ")}</span>}
          {settings && <ActionForm action={setKillSwitch} submit={ent.killSwitch ? "Turn off" : "Stop all outbound"} tone={ent.killSwitch ? "ghost" : "danger"} hidden={{ on: String(!ent.killSwitch) }} confirm={ent.killSwitch ? undefined : "Block all publishing, sends and launches for this workspace?"} />}
        </div>
      </Card>
    </div>
  );
}
