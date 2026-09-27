import Link from "next/link";
import { db } from "@/lib/audit/db";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { field, PageHeader } from "@/components/os/bits";
import { Notice, Pill, Tabs } from "@/components/os/v2";
import { claimDecide, claimPropose, profileSave, sourceAdd } from "../../_os/v2";

export const metadata = { title: "Business profile" };

const FIELDS: [string, string, string][] = [
  ["businessModel", "Business model", "What you sell, to whom, and how you make money"],
  ["audience", "Audience / ideal customer", "Who buys, who decides, what they care about"],
  ["offers", "Offers", "Products, services, packages and price points you are happy to state"],
  ["geography", "Geography", "Where you serve and where you want to grow"],
  ["website", "Website and channels", "Site, profiles and marketplaces in use"],
  ["tools", "Existing tools", "CRM, email, analytics, ads, store, booking…"],
  ["salesProcess", "Sales process", "How an enquiry becomes a customer; who follows up and how fast"],
  ["baseline", "Where you are today", "Current enquiries, sales, traffic — rough numbers are fine"],
  ["targets", "Targets", "What success looks like and by when"],
  ["constraints", "Constraints", "Budget range, approvals, regulation, things we must not say or do"],
  ["competitors", "Competitors", "Who you are compared with"],
  ["brandVoice", "Brand voice", "How you sound; words you use and avoid"],
];

// Structured discovery: what every plan, brief and AI draft is grounded in.
export default async function ProfilePage() {
  const { actor, ent } = await requireModule("engagement", "work.view");
  const canEdit = ent.accessMode === "active" && (can(actor.role, "os.settings") || can(actor.role, "work.request") || can(actor.role, "work.manage"));
  const [p, claims, sources] = await Promise.all([
    db.cosBusinessProfile.findUnique({ where: { orgId: actor.orgId } }),
    db.cosClaim.findMany({ where: { orgId: actor.orgId }, orderBy: { createdAt: "desc" }, take: 60 }),
    db.cosSource.findMany({ where: { orgId: actor.orgId, archivedAt: null }, orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  const filled = FIELDS.filter(([k]) => (p as Record<string, unknown> | null)?.[k]).length;
  return (
    <div className="max-w-[1000px]">
      <PageHeader title="Growth Plan" sub={`Business profile · ${filled} of ${FIELDS.length} sections filled${p ? ` · version ${p.version}` : ""}`} />
      <Tabs active="profile" items={[...(ent.modules.has("strategy") ? [{ key: "plan", label: "Goals and plan", href: "/app/strategy" }] : []), { key: "profile", label: "Business profile", href: "/app/strategy/profile" }, { key: "audit", label: "Diagnosis", href: "/app/audit" }]} />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          {canEdit ? (
            <ActionForm action={profileSave} submit="Save profile" className="grid gap-3 text-[13.5px]">
              {FIELDS.map(([k, label, hint]) => <div key={k}><Label htmlFor={k}>{label}</Label><textarea id={k} name={k} rows={2} defaultValue={((p as Record<string, unknown> | null)?.[k] as string) ?? ""} placeholder={hint} className={field} /></div>)}
              <div><Label htmlFor="contentPillars">Content pillars (up to 8, one per line)</Label><textarea id="contentPillars" name="contentPillars" rows={3} defaultValue={p?.contentPillars.join("\n") ?? ""} className={field} placeholder={"e.g. Patient education\nBehind the scenes\nResults and proof"} /></div>
            </ActionForm>
          ) : p ? <dl className="space-y-3 text-[13.5px]">{FIELDS.map(([k, label]) => <div key={k}><dt className="text-[12px] text-[var(--los-muted)]">{label}</dt><dd className="whitespace-pre-wrap">{((p as Record<string, unknown>)[k] as string) || "—"}</dd></div>)}</dl> : <Notice title="No profile yet">The business profile is filled in during discovery.</Notice>}
        </Card>
        <div className="space-y-5">
          <Card>
            <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Approved claims</div>
            <p className="px-5 pt-3 text-[12.5px] text-[var(--los-muted)]">Facts and results we may state in your content. Only you can approve them; anything else is written without the claim.</p>
            {claims.length === 0 ? <Notice title="No claims yet" /> : (
              <ul className="divide-y divide-[var(--los-line)] text-[13px]">{claims.map((c) => (
                <li key={c.id} className="px-5 py-2"><div className="flex items-start justify-between gap-2"><span>“{c.text}”</span><Pill value={c.status === "approved" ? "approved" : c.status === "retired" ? "cancelled" : "pending"} label={c.status} /></div>
                  {ent.accessMode === "active" && c.status === "proposed" && can(actor.role, "approvals.decide") && <ActionForm action={claimDecide} submit="Approve for use" tone="ghost" hidden={{ id: c.id, status: "approved" }} className="mt-1" />}
                  {ent.accessMode === "active" && c.status === "approved" && (can(actor.role, "approvals.decide") || can(actor.role, "work.manage")) && <ActionForm action={claimDecide} submit="Retire" tone="ghost" hidden={{ id: c.id, status: "retired" }} className="mt-1" />}
                </li>))}</ul>
            )}
            {canEdit && <ActionForm action={claimPropose} submit={isStaffRole(actor.role) ? "Propose claim" : "Add claim"} tone="ghost" className="grid gap-2 border-t border-[var(--los-line)] p-3 text-[13px]"><Input name="text" placeholder="e.g. 1,200 patients treated since 2015" required aria-label="Claim" /><Input name="evidenceNote" placeholder="How we know this" aria-label="Evidence" /></ActionForm>}
          </Card>
          <Card>
            <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Source material</div>
            {sources.length === 0 ? <Notice title="No sources yet">Fact sheets, research, transcripts and pages we should work from.</Notice> : <ul className="divide-y divide-[var(--los-line)] text-[13px]">{sources.map((s) => <li key={s.id} className="px-5 py-2"><span className="font-medium">{s.title}</span>{s.url && <a href={s.url} target="_blank" rel="noreferrer" className="ml-2 text-[var(--los-brand)] hover:underline">open</a>}{s.excerpt && <p className="line-clamp-2 text-[12.5px] text-[var(--los-muted)]">{s.excerpt}</p>}</li>)}</ul>}
            {canEdit && <ActionForm action={sourceAdd} submit="Add source" tone="ghost" className="grid gap-2 border-t border-[var(--los-line)] p-3 text-[13px]"><Input name="title" placeholder="Title" required aria-label="Title" /><Input name="url" type="url" placeholder="https://… (optional)" aria-label="Link" /><textarea name="excerpt" rows={2} className={field} placeholder="Key passage" aria-label="Excerpt" /></ActionForm>}
            <p className="px-5 pb-3 text-[12px] text-[var(--los-faint)]">Files go in <Link href="/app/assets?category=source" className="underline">Assets → Source</Link>.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
