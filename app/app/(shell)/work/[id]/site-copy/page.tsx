import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgPage } from "@/lib/os/guard";
import { can } from "@/lib/leados/rbac";
import { getWorkItem, WorkError } from "@/lib/os/work";
import { latestContent } from "@/lib/os/siteContent";
import { entitlements } from "@/lib/os/entitlements";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import GrowthStep from "@/components/os/GrowthStep";
import { field, PageHeader } from "@/components/os/bits";
import { siteCopySave } from "../../../_os/phase3";

export const metadata = { title: "Site copy" };

// WP-40 · site copy editor: keys + values with history, in-context preview of the staging site (?edit=1 highlights keys).
export default async function SiteCopyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; locale?: string }> }) {
  const actor = await requireOrgPage();
  const { id } = await params;
  const sp = await searchParams;
  let item; try { item = await getWorkItem(actor, id); } catch (e) { if (e instanceof WorkError) notFound(); throw e; }
  const locale = sp.locale && /^[a-z]{2}(-[A-Z]{2})?$/.test(sp.locale) ? sp.locale : "en";
  const [rows, ent] = await Promise.all([latestContent(id, locale), entitlements(actor.orgId)]);
  const payload = (item.payload ? JSON.parse(item.payload) : {}) as { stagingUrl?: string };
  const edit = (can(actor.role, "site.edit") || can(actor.role, "work.execute")) && ent.accessMode === "active";
  const preview = payload.stagingUrl ? `${payload.stagingUrl}${payload.stagingUrl.includes("?") ? "&" : "?"}edit=1` : null;
  return (
    <div className="space-y-4">
      <PageHeader title={`Site copy · ${item.title}`} sub={`Locale ${locale}. Every save is a new version; the site reads the latest through /api/os/site-content/${id}.`}><Link href={`/app/work/${id}`} className="text-[13px] underline">Back to the project</Link></PageHeader>
      {sp.saved && <GrowthStep done={`Saved “${sp.saved}”.`} step={{ pillar: "digital_presence", metric: "key_events", metricLabel: "Website key events", action: { kind: "work_item", label: "Ask for a copy review", title: `Review updated site copy: ${sp.saved}`, type: "task" } }} />}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="p-4 text-[13.5px]">
          <div className="mb-2 font-bold">Keys</div>
          {rows.length === 0 && <p className="mb-2 text-[var(--los-faint)]">No copy yet. Add the first key below (e.g. hero.title).</p>}
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.key} className="rounded-lg border border-[var(--los-line)] p-2">
                <div className="mb-1 flex items-center justify-between text-[12px] text-[var(--los-faint)]"><code>{r.key}</code><span>v{r.version} · {r.createdAt.toISOString().slice(0, 10)}</span></div>
                {edit ? <ActionForm action={siteCopySave} submit="Save" tone="ghost" hidden={{ id, key: r.key, locale }}><textarea name="value" defaultValue={r.value} rows={Math.min(8, Math.max(2, Math.ceil(r.value.length / 70)))} className={field} /></ActionForm> : <p className="whitespace-pre-wrap">{r.value}</p>}
              </li>
            ))}
          </ul>
          {edit && <ActionForm action={siteCopySave} submit="Add key" className="mt-3 space-y-2 border-t border-[var(--los-line)] pt-3" hidden={{ id, locale }}><div><Label>Key</Label><Input name="key" required placeholder="hero.title" pattern="[a-z0-9_.-]+" /></div><div><Label>Text</Label><textarea name="value" rows={3} className={field} required /></div></ActionForm>}
        </Card>
        <Card className="p-4 text-[13.5px]">
          <div className="mb-2 font-bold">Preview</div>
          {preview ? <iframe src={preview} title="Staging preview" className="h-[70vh] w-full rounded-lg border border-[var(--los-line)]" /> : <p className="text-[var(--los-faint)]">Add a staging URL on the project (QA section) to preview in context. Sites built by Catalyst highlight editable keys when opened with <code>?edit=1</code>.</p>}
        </Card>
      </div>
    </div>
  );
}
