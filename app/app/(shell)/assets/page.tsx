import Link from "next/link";
import { db } from "@/lib/audit/db";
import { can, isStaffRole } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { storageReady } from "@/lib/os/storage";
import { imageGenStatus } from "@/lib/os/imagegen";
import { Card, Input } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { day, field, PageHeader } from "@/components/os/bits";
import { Notice, Pill } from "@/components/os/v2";
import { assetUpdate } from "../_os/v2";
import { generateImage } from "./actions";
import UploadForm from "./UploadForm";

export const metadata = { title: "Assets" };
const CATS = ["brand", "source", "production", "deliverable"] as const;

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ category?: string; open?: string }> }) {
  const { actor, ent } = await requireModule("assets", "work.view");
  const sp = await searchParams;
  const staff = isStaffRole(actor.role), writable = ent.accessMode === "active";
  const assets = await db.cosAsset.findMany({ where: { orgId: actor.orgId, status: { not: "archived" }, ...(staff ? {} : { clientVisible: true }), ...(sp.category && (CATS as readonly string[]).includes(sp.category) ? { category: sp.category } : {}) }, include: { versions: { orderBy: { version: "desc" } } }, orderBy: { createdAt: "desc" }, take: 200 });
  const img = imageGenStatus();
  const mb = (n: number) => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  return (
    <div className="max-w-[1180px]">
      <PageHeader title="Assets" sub="Brand files, source material and everything produced for you — versioned, with usage rights.">{can(actor.role, "org.export") && <a href="/api/os/export" className="rounded-lg border border-[var(--los-line)] px-3 py-1.5 text-[13px] font-semibold hover:bg-[var(--los-surface-2)]">Export list</a>}</PageHeader>
      <nav aria-label="Asset type" className="mb-4 flex flex-wrap gap-1 text-[13px]">{[["", "All"], ...CATS.map((c) => [c, c[0].toUpperCase() + c.slice(1)])].map(([k, l]) => <Link key={k} href={k ? `/app/assets?category=${k}` : "/app/assets"} aria-current={(sp.category ?? "") === k ? "page" : undefined} className={`rounded-full px-3 py-1 ${(sp.category ?? "") === k ? "bg-[var(--los-brand)] font-semibold text-white" : "border border-[var(--los-line)]"}`}>{l}</Link>)}</nav>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          {assets.length === 0 ? <Notice title="No files here yet">Upload your logo, brand guidelines and any material we should work from. Finished videos and images for publishing live here too.</Notice> : (
            <ul className="divide-y divide-[var(--los-line)]">
              {assets.map((a) => {
                const v = a.versions[0];
                const approve = a.status !== "approved" && (["brand", "source"].includes(a.category) ? can(actor.role, "approvals.decide") : can(actor.role, "approvals.decide") || can(actor.role, "work.review") || can(actor.role, "work.manage"));
                return (
                  <li key={a.id} className="flex gap-3 px-5 py-3 text-[13px]">
                    {a.kind === "image" ? <img src={`/api/os/assets/${a.id}`} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[var(--los-surface-2)]"><span className="material-symbols-outlined text-[22px] text-[var(--los-faint)]" aria-hidden>{a.kind === "video" ? "movie" : a.kind === "audio" ? "graphic_eq" : "description"}</span></div>}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2"><a href={`/api/os/assets/${a.id}`} target="_blank" rel="noreferrer" className="truncate font-semibold text-[var(--los-brand)] hover:underline">{a.name}</a><span className="flex items-center gap-2">{!a.clientVisible && <Pill value="paused" label="internal" />}{a.origin === "ai_generated" && <Pill value="draft" label="AI generated" />}<Pill value={a.status === "approved" ? "approved" : "draft"} label={a.status} /></span></div>
                      <div className="text-[12px] text-[var(--los-faint)]">{a.category} · v{a.currentVersion} · {v ? `${mb(v.sizeBytes)} · ${v.mime}` : ""}{v?.durationSec ? ` · ${v.durationSec}s` : ""} · {day(a.createdAt)}</div>
                      <div className="text-[12px] text-[var(--los-muted)]">{a.rightsNote ? `Rights: ${a.rightsNote}` : <span className="text-[var(--los-warn)]">Usage rights not recorded</span>}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-3">
                        <a href={`/api/os/assets/${a.id}?download=1`} className="text-[12.5px] font-semibold hover:underline">Download</a>
                        {a.versions.length > 1 && <span className="text-[12px] text-[var(--los-faint)]">Earlier: {a.versions.slice(1, 5).map((x) => <a key={x.version} href={`/api/os/assets/${a.id}?v=${x.version}&download=1`} className="mr-1 underline">v{x.version}</a>)}</span>}
                        {writable && <Link href={`/app/assets?open=${a.id}`} className="text-[12.5px] hover:underline">Details / new version</Link>}
                        {writable && approve && <ActionForm action={assetUpdate} submit="Approve" tone="ghost" hidden={{ id: a.id, status: "approved" }} />}
                      </div>
                      {sp.open === a.id && writable && (
                        <div className="mt-3 grid gap-4 rounded-lg border border-[var(--los-line)] p-3 md:grid-cols-2">
                          <ActionForm action={assetUpdate} submit="Save details" tone="ghost" hidden={{ id: a.id, visibilitySent: "1" }} className="grid gap-2"><Input name="name" defaultValue={a.name} aria-label="Name" /><select name="category" defaultValue={a.category} className={field} aria-label="Type">{CATS.map((c) => <option key={c}>{c}</option>)}</select><Input name="rightsNote" defaultValue={a.rightsNote ?? ""} placeholder="Usage rights" aria-label="Usage rights" /><Input name="sourceNote" defaultValue={a.sourceNote ?? ""} placeholder="Where it came from" aria-label="Source" /><Input name="tags" defaultValue={a.tags.join(", ")} placeholder="tags, comma separated" aria-label="Tags" />{staff && <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" name="clientVisible" defaultChecked={a.clientVisible} /> Visible to the client</label>}</ActionForm>
                          <UploadForm assetId={a.id} canHide={false} />
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-2 text-[15px] font-bold">Upload</div>
            {!writable ? <Notice kind="blocked" title="This workspace is read-only">Files can still be downloaded and exported.</Notice> : storageReady() ? <UploadForm canHide={staff} /> : <Notice kind="setup" title="File storage requires setup">Uploads are switched off until storage is configured. Share links in Work for now.</Notice>}
          </Card>
          {staff && (
            <Card className="p-5">
              <div className="mb-2 text-[15px] font-bold">Generate an image</div>
              {img.ready && writable ? (
                <ActionForm action={generateImage} submit="Generate draft image" className="grid gap-2 text-[13.5px]"><textarea name="prompt" rows={3} className={field} required placeholder="Describe the image. No real people, logos or trademarks." aria-label="Image description" /><p className="text-[12px] text-[var(--los-faint)]">Saved as a draft, labelled AI generated, internal until approved. Provider: {img.provider}.</p></ActionForm>
              ) : <Notice kind="setup" title="Requires setup">{img.reason}</Notice>}
            </Card>
          )}
          <Card className="p-5 text-[13px]">
            <div className="mb-2 text-[15px] font-bold">Video production</div>
            <ol className="list-decimal space-y-1 pl-5 text-[var(--los-muted)]"><li>Research and angle</li><li>Script <span className="text-[var(--los-faint)]">(text — not a video)</span></li><li>Storyboard / shot list</li><li>Recording → upload raw footage here</li><li>Editing and rendering → upload the finished file here</li><li>Captions and thumbnail → upload here</li><li>QA, your approval, publishing</li></ol>
            <p className="mt-2 text-[12px] text-[var(--los-faint)]">Long-form and short-form cuts are separate files and separate approvals. Only a finished, uploaded video can be attached to a YouTube, Shorts or Reels version.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
