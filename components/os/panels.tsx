// Self-contained server panels mounted into existing pages (work item, lead, workspace settings).
import Link from "next/link";
import { db } from "@/lib/audit/db";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { unmetDependencies } from "@/lib/os/engagement";
import { CHANNELS } from "@/lib/os/channels";
import { COMMON_ZONES, formatInZone } from "@/lib/os/time";
import { testAdapterEnabled } from "@/lib/os/adapters";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { day, field } from "@/components/os/bits";
import { money, Notice, Pill } from "@/components/os/v2";
import { accountConnectKey, accountDisconnect, accountRecheck, ga4Property } from "@/app/app/(shell)/_os/accounts";
import { dependencyAdd, dependencyRemove, opportunityCreate, opportunityStatus, workspaceTime } from "@/app/app/(shell)/_os/v2";

/** Work item: what it waits on, who does it, how it is accepted and measured. */
export async function WorkContext({ orgId, itemId, role }: { orgId: string; itemId: string; role: string }) {
  const item = await db.cosWorkItem.findFirst({ where: { id: itemId, orgId } });
  if (!item) return null;
  const manage = isStaffRole(role) && can(role, "work.manage");
  const [deps, unmet, goal, campaign, engagement, siblings, checklist] = await Promise.all([
    db.cosDependency.findMany({ where: { orgId, workItemId: item.id }, include: { onChecklist: true } }),
    unmetDependencies(orgId, item.id),
    item.goalId ? db.cosGoal.findFirst({ where: { id: item.goalId, orgId } }) : null,
    item.campaignId ? db.cosCampaign.findFirst({ where: { id: item.campaignId, orgId } }) : null,
    item.engagementId ? db.cosEngagement.findFirst({ where: { id: item.engagementId, orgId } }) : null,
    manage ? db.cosWorkItem.findMany({ where: { orgId, id: { not: item.id }, engagementId: item.engagementId, state: { notIn: ["closed", "cancelled"] } }, select: { id: true, title: true }, take: 60, orderBy: { createdAt: "desc" } }) : [],
    manage && item.engagementId ? db.cosChecklistItem.findMany({ where: { orgId, engagementId: item.engagementId }, select: { id: true, label: true } }) : [],
  ]);
  const works = deps.filter((d) => d.onWorkItemId).length ? await db.cosWorkItem.findMany({ where: { orgId, id: { in: deps.map((d) => d.onWorkItemId!).filter(Boolean) } }, select: { id: true, title: true, state: true } }) : [];
  return (
    <Card className="mb-5">
      <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Plan context</div>
      <dl className="grid gap-3 px-5 py-3 text-[13px] md:grid-cols-3">
        <div><dt className="text-[12px] text-[var(--los-muted)]">Engagement</dt><dd>{engagement ? <Link className="text-[var(--los-brand)] hover:underline" href={`/app/engagement/${engagement.id}`}>{engagement.name}</Link> : "—"}</dd></div>
        <div><dt className="text-[12px] text-[var(--los-muted)]">Goal it serves</dt><dd>{goal ? `${goal.metric} → ${goal.target} ${goal.unit}` : "Not linked"}</dd></div>
        <div><dt className="text-[12px] text-[var(--los-muted)]">Campaign</dt><dd>{campaign ? <Link className="text-[var(--los-brand)] hover:underline" href={`/app/content/campaigns/${campaign.id}`}>{campaign.name}</Link> : "—"}</dd></div>
        <div><dt className="text-[12px] text-[var(--los-muted)]">Done by</dt><dd className="capitalize">{item.responsibility === "catalyst" ? "Catalyst" : item.responsibility === "client" ? "Your team" : "Shared"}{item.assignRole ? ` · ${item.assignRole}` : ""}</dd></div>
        <div className="md:col-span-2"><dt className="text-[12px] text-[var(--los-muted)]">Accepted when</dt><dd>{item.acceptanceCriteria ?? "Not specified"}</dd></div>
        {item.measure && <div className="md:col-span-3"><dt className="text-[12px] text-[var(--los-muted)]">Measured by</dt><dd>{item.measure}</dd></div>}
        {item.deliveredAt && <div><dt className="text-[12px] text-[var(--los-muted)]">Delivered</dt><dd>{day(item.deliveredAt)}</dd></div>}
      </dl>
      <div className="border-t border-[var(--los-line)] px-5 py-3 text-[13px]">
        <div className="mb-1 font-semibold">Depends on</div>
        {deps.length === 0 ? <p className="text-[var(--los-faint)]">Nothing — this can start whenever it is ready.</p> : (
          <ul className="space-y-1">{deps.map((d) => { const w = works.find((x) => x.id === d.onWorkItemId); const waiting = unmet.some((u) => u.id === d.id); return (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2"><span>{w ? <Link href={`/app/work/${w.id}`} className="text-[var(--los-brand)] hover:underline">{w.title}</Link> : d.onChecklist ? <Link href={`/app/engagement/${d.onChecklist.engagementId}`} className="text-[var(--los-brand)] hover:underline">{d.onChecklist.label}</Link> : "—"}</span><span className="flex items-center gap-2"><Pill value={waiting ? "blocked" : "available"} label={waiting ? "waiting" : "done"} />{manage && <ActionForm action={dependencyRemove} submit="Remove" tone="ghost" hidden={{ id: d.id }} />}</span></li>); })}</ul>
        )}
        {unmet.length > 0 && <p role="status" className="mt-2 text-[12.5px] text-[var(--los-danger)]">Cannot start yet. Other work that does not depend on these continues.</p>}
        {manage && <ActionForm action={dependencyAdd} submit="Add dependency" tone="ghost" hidden={{ workItemId: item.id }} className="mt-3 flex flex-wrap items-end gap-2"><select name="onWorkItemId" className={`${field} !w-auto max-w-[260px]`} aria-label="Depends on work item"><option value="">A work item…</option>{siblings.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select><select name="onChecklistId" className={`${field} !w-auto max-w-[260px]`} aria-label="Depends on onboarding item"><option value="">…or an access / asset item</option>{checklist.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></ActionForm>}
      </div>
    </Card>
  );
}

/** Lead: attribution + sales opportunities (a won opportunity with amount, currency and date is a recorded sale). */
export async function LeadOutcomes({ orgId, leadId, role, currency }: { orgId: string; leadId: string; role: string; currency: string }) {
  const [lead, opps] = await Promise.all([db.losLead.findFirst({ where: { id: leadId, orgId } }), db.cosOpportunity.findMany({ where: { orgId, leadId }, orderBy: { createdAt: "desc" } })]);
  if (!lead) return null;
  const campaign = lead.marketingCampaignId ? await db.cosCampaign.findFirst({ where: { id: lead.marketingCampaignId, orgId }, select: { id: true, name: true } }) : null;
  const edit = can(role, "leads.edit");
  return (
    <Card className="mb-5">
      <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Where this enquiry came from, and what it became</div>
      <div className="px-5 py-3 text-[13px]">
        <p><Pill value={lead.attributionKind === "known" ? "verified" : lead.attributionKind === "self_reported" ? "pending" : "draft"} label={lead.attributionKind === "known" ? "tagged link" : lead.attributionKind === "self_reported" ? "told us" : "source unknown"} /> <span className="ml-1">{lead.attributionKind === "known" ? `${lead.utmSource ?? "?"} · ${lead.utmMedium ?? "?"}` : lead.selfReportedSource ?? "No tagged link was used, so the source cannot be shown."}</span>{campaign && <> · campaign <Link className="text-[var(--los-brand)] hover:underline" href={`/app/content/campaigns/${campaign.id}`}>{campaign.name}</Link></>}</p>
      </div>
      {opps.length === 0 ? <Notice title="No opportunity yet">Open one when this enquiry becomes a real sales conversation.</Notice> : (
        <ul className="divide-y divide-[var(--los-line)] border-t border-[var(--los-line)] text-[13px]">{opps.map((o) => (
          <li key={o.id} className="px-5 py-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{o.title}</span><span className="flex items-center gap-2">{money(o.valueMinor, o.currency) ?? "value not set"}{o.closeDate ? ` · closed ${day(o.closeDate)}` : ""}<Pill value={o.status} /></span></div>
            {edit && !["won", "lost"].includes(o.status) && <ActionForm action={opportunityStatus} submit="Update" tone="ghost" hidden={{ id: o.id }} className="mt-2 grid gap-2 md:grid-cols-5 md:items-end"><select name="status" defaultValue={o.status} className={field} aria-label="Status"><option value="open">Open</option><option value="qualified">Qualified</option><option value="proposal">Proposal</option><option value="won">Won — record the sale</option><option value="lost">Lost</option></select><Input name="value" inputMode="decimal" placeholder="Amount" aria-label="Amount" defaultValue={o.valueMinor != null ? (Number(o.valueMinor) / 100).toFixed(2) : ""} /><Input name="currency" maxLength={3} defaultValue={o.currency ?? currency} aria-label="Currency" /><Input name="closeDate" type="date" aria-label="Close date" /><Input name="lostReason" placeholder="If lost: why" aria-label="Lost reason" /></ActionForm>}
          </li>))}</ul>
      )}
      {edit && <ActionForm action={opportunityCreate} submit="Open opportunity" tone="ghost" hidden={{ leadId }} className="flex flex-wrap items-end gap-2 border-t border-[var(--los-line)] p-3 text-[13px]"><Input name="title" placeholder="What they want" aria-label="Title" /><Input name="value" inputMode="decimal" placeholder="Expected amount (optional)" aria-label="Amount" /><Input name="currency" maxLength={3} defaultValue={currency} aria-label="Currency" /></ActionForm>}
    </Card>
  );
}

/** Settings: every connected account with what it can actually do, plus workspace time zone and currency. */
export async function AccountsPanel({ orgId, role, timezone, currency }: { orgId: string; role: string; timezone: string; currency: string }) {
  const conns = await db.cosConnection.findMany({ where: { orgId, provider: { in: ["gsc", "linkedin", "x", "meta", "youtube", "wordpress", "test"] } }, orderBy: [{ provider: "asc" }, { createdAt: "asc" }] });
  const edit = can(role, "os.settings");
  const google = conns.find((c) => c.provider === "gsc" && c.status === "verified");
  return (
    <>
      <Card className="mb-5">
        <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Connected accounts</div>
        {conns.length === 0 ? <Notice kind="disconnected" title="No accounts connected">Connect the accounts we publish to and read results from. You sign in with the platform itself — we never see or store your password.</Notice> : (
          <ul className="divide-y divide-[var(--los-line)] text-[13px]">{conns.map((c) => (
            <li key={c.id} className="px-5 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{c.accountLabel ?? c.provider}<span className="ml-2 font-normal text-[var(--los-faint)]">{Object.values(CHANNELS).find((ch) => ch.provider === c.provider)?.label ?? (c.provider === "gsc" ? "Google Search Console / Analytics" : c.provider === "test" ? "TEST account (not a real platform)" : c.provider)}{c.accountType ? ` · ${c.accountType.replace(/_/g, " ")}` : ""}</span></span><Pill value={c.status} /></div>
              <div className="text-[12px] text-[var(--los-muted)]">Can publish: <b>{c.capabilities.includes("publish") ? "yes" : "no"}</b> · Can read results: <b>{c.capabilities.includes("analytics") ? "yes" : "no"}</b>{c.liveVerifiedAt ? ` · last confirmed working ${formatInZone(c.liveVerifiedAt, timezone, { dateStyle: "medium" })}` : " · never confirmed with a real call"}</div>
              {c.eligibilityNote && <div className="text-[12px] text-[var(--los-warn)]">{c.eligibilityNote}</div>}
              {c.lastError && <div className="text-[12px] text-[var(--los-danger)]">{c.lastError}</div>}
              {edit && c.status !== "disconnected" && <div className="mt-1 flex gap-2"><ActionForm action={accountRecheck} submit="Test" tone="ghost" hidden={{ id: c.id }} /><ActionForm action={accountDisconnect} submit="Disconnect" tone="danger" hidden={{ id: c.id }} confirm="Disconnecting destroys the stored access. Scheduled posts for this account will fail until it is reconnected." /></div>}
            </li>))}</ul>
        )}
        {edit && (
          <div className="grid gap-4 border-t border-[var(--los-line)] p-5 text-[13px] md:grid-cols-2">
            <ActionForm action={accountConnectKey} submit="Connect blog" tone="ghost" hidden={{ provider: "wordpress" }} className="grid gap-2"><div className="font-semibold">WordPress blog</div><Input name="site" type="url" placeholder="https://blog.example.com" required aria-label="Site address" /><Input name="user" placeholder="WordPress username" required aria-label="Username" autoComplete="off" /><Input name="secret" type="password" placeholder="Application password (not your login password)" required aria-label="Application password" autoComplete="off" /><p className="text-[12px] text-[var(--los-faint)]">Create an application password in WordPress → Users → Profile. It can be revoked there at any time. It is stored encrypted and tested before it is accepted.</p></ActionForm>
            {google && <ActionForm action={ga4Property} submit="Save" tone="ghost" hidden={{ id: google.id }} className="grid gap-2"><div className="font-semibold">Website analytics property</div><Input name="propertyId" inputMode="numeric" placeholder="GA4 property ID (numbers only)" defaultValue={(JSON.parse(google.config ?? "{}") as { ga4PropertyId?: string }).ga4PropertyId ?? ""} aria-label="GA4 property ID" /><p className="text-[12px] text-[var(--los-faint)]">Needed to read website sessions per campaign. Find it in Google Analytics → Admin → Property details.</p></ActionForm>}
            {testAdapterEnabled() && <ActionForm action={accountConnectKey} submit="Add test account" tone="ghost" hidden={{ provider: "test" }} className="grid gap-2"><div className="font-semibold">Test account (development only)</div><select name="mode" className={field} aria-label="Behaviour"><option value="ok">Always succeeds</option><option value="retryable_once">Busy once, then succeeds</option><option value="uncertain">No answer (ambiguous)</option><option value="partial">Fails part-way through a thread</option><option value="definite">Rejects the post</option></select><p className="text-[12px] text-[var(--los-faint)]">Posts nothing anywhere. Publications made with it are labelled TEST and never count as live verification.</p></ActionForm>}
          </div>
        )}
      </Card>
      {edit && (
        <Card className="mb-5 p-5">
          <div className="mb-2 text-[15px] font-bold">Time zone and reporting currency</div>
          <ActionForm action={workspaceTime} submit="Save" className="grid gap-2 text-[13.5px] md:grid-cols-3 md:items-end"><div className="md:col-span-2"><Label htmlFor="tz">Time zone (schedules and report periods use it)</Label><input id="tz" name="timezone" list="zones" defaultValue={timezone} className={field} /><datalist id="zones">{COMMON_ZONES.map((z) => <option key={z} value={z} />)}</datalist></div><div><Label htmlFor="cur">Currency</Label><Input id="cur" name="currency" maxLength={3} defaultValue={currency} /></div></ActionForm>
        </Card>
      )}
    </>
  );
}
