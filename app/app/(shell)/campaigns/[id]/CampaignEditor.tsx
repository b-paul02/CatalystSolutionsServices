"use client";

// The campaign wizard (§5.7): sectioned editor covering all 7 steps.
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addTrackingLink, launchCampaign, saveCampaignSection, setCampaignStatus, submitCampaignForReview,
} from "../actions";
import type { FormState } from "../../../(auth)/actions";
import type { Distribution, FormField, FormSpec, PageSpec } from "@/lib/leados/campaigns";
import { Badge, Card, GhostButton, Input, Label, Select, SubmitButton } from "@/components/leados/ui";
import { useActionState } from "react";

type Campaign = {
  id: string; status: string; type: string; publicUrl: string;
  offer: Record<string, string>;
  formSpec: FormSpec;
  pageSpec: PageSpec;
  distribution: Distribution;
  trackingLinks: { id: string; label: string; code: string }[];
};

const PURPOSES = ["sales_contact", "service_updates", "marketing", "survey"];
const CHANNELS = ["call", "whatsapp", "sms", "email"];

export default function CampaignEditor(props: {
  campaign: Campaign;
  canManage: boolean;
  members: { userId: string; label: string }[];
  analytics: { views: number; submits: number; accepted: number };
  submissions: { id: string; status: string; createdAt: string; leadId: string | null; data: string; trackingCode: string | null }[];
}) {
  const { campaign: c, canManage } = props;
  const router = useRouter();
  const [tab, setTab] = useState<"offer" | "form" | "page" | "distribution" | "launch">("offer");
  const [pending, start] = useTransition();
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [problems, setProblems] = useState<{ severity: string; message: string }[]>([]);

  // Local editable copies
  const [offer, setOffer] = useState(c.offer);
  const [form, setForm] = useState<FormSpec>(c.formSpec);
  const [page, setPage] = useState<PageSpec>(c.pageSpec);
  const [dist, setDist] = useState<Distribution>({ mode: c.distribution.mode ?? "round_robin", userIds: c.distribution.userIds ?? [], slaMinutes: c.distribution.slaMinutes ?? 60, ackEmail: c.distribution.ackEmail ?? true, ackTemplate: c.distribution.ackTemplate });

  const save = (section: string, payload: unknown) =>
    start(async () => {
      const fd = new FormData();
      fd.set("campaignId", c.id);
      fd.set("section", section);
      fd.set("payload", JSON.stringify(payload));
      const result = await saveCampaignSection({}, fd);
      setSaveMsg(result.error ?? result.ok ?? null);
      router.refresh();
    });

  const tabs = [
    { key: "offer", label: "1 · Offer" },
    { key: "form", label: "2 · Lead form" },
    { key: "page", label: "3 · Landing page" },
    { key: "distribution", label: "4 · Follow-up" },
    { key: "launch", label: "5 · Review & launch" },
  ] as const;

  const field = (f: FormField, list: "fields" | "qualifying", i: number) => (
    <div key={`${list}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--los-surface-2)] px-3 py-2 text-[13px]">
      <span className="font-medium">{f.label}</span>
      <Badge>{f.kind}</Badge>
      <label className="flex items-center gap-1 text-[12.5px] text-[var(--los-muted)]">
        <input
          type="checkbox"
          checked={f.required}
          disabled={!canManage}
          onChange={(e) => {
            const next = { ...form, [list]: form[list].map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)) };
            setForm(next);
          }}
        />
        required
      </label>
      {canManage && (
        <button
          className="ml-auto text-[12px] text-[var(--los-danger)]"
          onClick={() => setForm({ ...form, [list]: form[list].filter((_, j) => j !== i) })}
        >
          remove
        </button>
      )}
    </div>
  );

  const [newField, setNewField] = useState({ label: "", kind: "text" as FormField["kind"], qualifying: false });

  return (
    <div className="space-y-4">
      {/* analytics strip (always visible once launched) */}
      {(c.status === "active" || c.status === "paused" || c.status === "completed") && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Page views", value: props.analytics.views },
            { label: "Submissions", value: props.analytics.submits },
            { label: "Accepted leads", value: props.analytics.accepted },
          ].map((s) => (
            <Card key={s.label} className="p-4">
              <div className="text-[12.5px] text-[var(--los-muted)]">{s.label}</div>
              <div className="text-[26px] font-extrabold">{s.value}</div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-[var(--los-line)] pb-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[13.5px] font-medium ${tab === t.key ? "bg-[var(--los-brand-soft)] text-[var(--los-brand)]" : "text-[var(--los-muted)] hover:bg-[var(--los-surface-2)]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {saveMsg && <div className="text-[13px] text-[var(--los-muted)]">{saveMsg}</div>}

      {tab === "offer" && (
        <Card className="max-w-[640px] space-y-4 p-5">
          <div>
            <Label>Product or service</Label>
            <Input value={offer.product ?? ""} disabled={!canManage} onChange={(e) => setOffer({ ...offer, product: e.target.value })} placeholder="2BHK apartments in Thane" />
          </div>
          <div>
            <Label>Target geography</Label>
            <Input value={offer.geography ?? ""} disabled={!canManage} onChange={(e) => setOffer({ ...offer, geography: e.target.value })} placeholder="Mumbai metropolitan region" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Language</Label>
              <Input value={offer.language ?? "en"} disabled={!canManage} onChange={(e) => setOffer({ ...offer, language: e.target.value })} />
            </div>
            <div>
              <Label>Expected volume / month</Label>
              <Input value={offer.expectedVolume ?? ""} disabled={!canManage} onChange={(e) => setOffer({ ...offer, expectedVolume: e.target.value })} placeholder="100" />
            </div>
          </div>
          {canManage && <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--los-brand)] px-4 py-2 text-[14px] font-semibold text-white hover:opacity-90 disabled:opacity-50" disabled={pending} onClick={() => save("offer", offer)}>Save offer</button>}
        </Card>
      )}

      {tab === "form" && (
        <Card className="max-w-[640px] space-y-4 p-5">
          <div>
            <div className="mb-2 text-[13.5px] font-semibold">Contact fields</div>
            <div className="space-y-2">{form.fields.map((f, i) => field(f, "fields", i))}</div>
          </div>
          <div>
            <div className="mb-2 text-[13.5px] font-semibold">Qualifying questions</div>
            <div className="space-y-2">
              {form.qualifying.map((f, i) => field(f, "qualifying", i))}
              {form.qualifying.length === 0 && <p className="text-[12.5px] text-[var(--los-faint)]">None yet — e.g. budget, timeline, preferred locality.</p>}
            </div>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg bg-[var(--los-surface-2)] p-3">
              <div className="flex-1">
                <Label>New field label</Label>
                <Input value={newField.label} onChange={(e) => setNewField({ ...newField, label: e.target.value })} placeholder="Budget range" />
              </div>
              <div>
                <Label>Kind</Label>
                <Select value={newField.kind} onChange={(e) => setNewField({ ...newField, kind: e.target.value as FormField["kind"] })}>
                  {["text", "email", "phone", "select", "textarea", "checkbox"].map((k) => <option key={k} value={k}>{k}</option>)}
                </Select>
              </div>
              <label className="flex items-center gap-1.5 pb-2 text-[12.5px]">
                <input type="checkbox" checked={newField.qualifying} onChange={(e) => setNewField({ ...newField, qualifying: e.target.checked })} />
                qualifying
              </label>
              <GhostButton
                onClick={() => {
                  if (!newField.label.trim()) return;
                  const f: FormField = {
                    key: newField.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30),
                    label: newField.label.trim(), kind: newField.kind, required: false,
                  };
                  setForm(newField.qualifying ? { ...form, qualifying: [...form.qualifying, f] } : { ...form, fields: [...form.fields, f] });
                  setNewField({ label: "", kind: "text", qualifying: newField.qualifying });
                }}
              >
                Add
              </GhostButton>
            </div>
          )}
          <div className="space-y-2 rounded-lg bg-[var(--los-surface-2)] p-3">
            <div className="text-[13.5px] font-semibold">Consent (shown on the form, cannot be hidden)</div>
            <div>
              <Label>Purposes the person agrees to</Label>
              <div className="flex flex-wrap gap-3 text-[13px]">
                {PURPOSES.map((p) => (
                  <label key={p} className="flex items-center gap-1.5">
                    <input
                      type="checkbox" disabled={!canManage}
                      checked={form.consentPurposes.includes(p)}
                      onChange={(e) => setForm({ ...form, consentPurposes: e.target.checked ? [...form.consentPurposes, p] : form.consentPurposes.filter((x) => x !== p) })}
                    />
                    {p.replace(/_/g, " ")}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Channels the person agrees to</Label>
              <div className="flex flex-wrap gap-3 text-[13px]">
                {CHANNELS.map((ch) => (
                  <label key={ch} className="flex items-center gap-1.5">
                    <input
                      type="checkbox" disabled={!canManage}
                      checked={form.consentChannels.includes(ch)}
                      onChange={(e) => setForm({ ...form, consentChannels: e.target.checked ? [...form.consentChannels, ch] : form.consentChannels.filter((x) => x !== ch) })}
                    />
                    {ch}
                  </label>
                ))}
              </div>
            </div>
          </div>
          {canManage && <GhostButton onClick={() => save("form", form)} disabled={pending}>Save form</GhostButton>}
        </Card>
      )}

      {tab === "page" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-4 p-5">
            <div>
              <Label>Template</Label>
              <Select value={page.template} disabled={!canManage} onChange={(e) => setPage({ ...page, template: e.target.value as PageSpec["template"] })}>
                <option value="clean">Clean (centered)</option>
                <option value="split">Split (copy + form)</option>
                <option value="compact">Compact (form first)</option>
              </Select>
            </div>
            <div><Label>Headline</Label><Input value={page.headline} disabled={!canManage} onChange={(e) => setPage({ ...page, headline: e.target.value })} /></div>
            <div>
              <Label>Body</Label>
              <textarea
                value={page.body} disabled={!canManage}
                onChange={(e) => setPage({ ...page, body: e.target.value })}
                className="h-24 w-full rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-3 py-2 text-[14px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Button text</Label><Input value={page.cta} disabled={!canManage} onChange={(e) => setPage({ ...page, cta: e.target.value })} /></div>
              <div><Label>Brand color</Label><Input type="color" value={page.brandColor} disabled={!canManage} onChange={(e) => setPage({ ...page, brandColor: e.target.value })} className="!h-[38px] !p-1" /></div>
            </div>
            <div><Label>Thank-you message</Label><Input value={page.thankYouMessage} disabled={!canManage} onChange={(e) => setPage({ ...page, thankYouMessage: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>WhatsApp number (optional)</Label><Input value={page.whatsappNumber ?? ""} disabled={!canManage} onChange={(e) => setPage({ ...page, whatsappNumber: e.target.value })} placeholder="+91…" /></div>
              <div><Label>Calendar link (optional)</Label><Input value={page.calendarUrl ?? ""} disabled={!canManage} onChange={(e) => setPage({ ...page, calendarUrl: e.target.value })} /></div>
            </div>
            {canManage && <GhostButton onClick={() => save("page", page)} disabled={pending}>Save page</GhostButton>}
          </Card>
          {/* live preview */}
          <Card className="p-5">
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--los-faint)]">Preview</div>
            <div className="rounded-xl border border-[var(--los-line)] p-5" style={{ borderTopColor: page.brandColor, borderTopWidth: 4 }}>
              <h2 className="text-[20px] font-extrabold">{page.headline}</h2>
              <p className="mt-1 text-[13.5px] text-[var(--los-muted)]">{page.body}</p>
              <div className="mt-3 space-y-2">
                {form.fields.slice(0, 4).map((f) => (
                  <div key={f.key} className="rounded-lg border border-[var(--los-line)] px-3 py-2 text-[13px] text-[var(--los-faint)]">
                    {f.label}{f.required ? " *" : ""}
                  </div>
                ))}
                <div className="rounded-lg px-3 py-2 text-center text-[13.5px] font-semibold text-white" style={{ background: page.brandColor }}>
                  {page.cta}
                </div>
                <p className="text-[11px] text-[var(--los-faint)]">
                  ☑ I agree to be contacted about {form.consentPurposes.map((p) => p.replace(/_/g, " ")).join(", ")} via {form.consentChannels.join(", ")}.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {tab === "distribution" && (
        <Card className="max-w-[640px] space-y-4 p-5">
          <div>
            <Label>Assignment</Label>
            <Select value={dist.mode} disabled={!canManage} onChange={(e) => setDist({ ...dist, mode: e.target.value as Distribution["mode"] })}>
              <option value="round_robin">Round robin among selected team</option>
              <option value="fixed">Always the first selected person</option>
            </Select>
          </div>
          <div>
            <Label>Team members receiving leads</Label>
            <div className="space-y-1.5">
              {props.members.map((m) => (
                <label key={m.userId} className="flex items-center gap-2 text-[13.5px]">
                  <input
                    type="checkbox" disabled={!canManage}
                    checked={dist.userIds.includes(m.userId)}
                    onChange={(e) => setDist({ ...dist, userIds: e.target.checked ? [...dist.userIds, m.userId] : dist.userIds.filter((x) => x !== m.userId) })}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>First-response SLA (minutes)</Label>
              <Input type="number" min={5} value={dist.slaMinutes} disabled={!canManage} onChange={(e) => setDist({ ...dist, slaMinutes: parseInt(e.target.value, 10) || 60 })} />
            </div>
            <label className="flex items-center gap-2 pt-6 text-[13.5px]">
              <input type="checkbox" disabled={!canManage} checked={dist.ackEmail} onChange={(e) => setDist({ ...dist, ackEmail: e.target.checked })} />
              Send acknowledgement email
            </label>
          </div>
          {canManage && <GhostButton onClick={() => save("distribution", dist)} disabled={pending}>Save follow-up</GhostButton>}
        </Card>
      )}

      {tab === "launch" && (
        <div className="max-w-[720px] space-y-4">
          {problems.length > 0 && (
            <Card className="space-y-1.5 p-4">
              {problems.map((p, i) => (
                <div key={i} className={`text-[13.5px] ${p.severity === "error" ? "text-[var(--los-danger)]" : "text-[var(--los-warn)]"}`}>
                  {p.severity === "error" ? "✕" : "⚠"} {p.message}
                </div>
              ))}
            </Card>
          )}
          <Card className="space-y-3 p-5">
            {["draft", "rejected"].includes(c.status) && canManage && (
              <>
                <p className="text-[13.5px] text-[var(--los-muted)]">
                  Save every section first, then submit. Our team reviews the consent language,
                  privacy notice, and claims — usually within one working day.
                </p>
                <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--los-brand)] px-4 py-2 text-[14px] font-semibold text-white hover:opacity-90 disabled:opacity-50" disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await submitCampaignForReview(c.id);
                      setProblems(r.problems);
                      router.refresh();
                    })
                  }
                >
                  Submit for review
                </button>
              </>
            )}
            {c.status === "in_review" && <p className="text-[13.5px] text-[var(--los-warn)]">In review — you'll be able to launch once approved.</p>}
            {(c.status === "approved" || c.status === "paused") && canManage && (
              <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--los-brand)] px-4 py-2 text-[14px] font-semibold text-white hover:opacity-90 disabled:opacity-50" disabled={pending} onClick={() => start(async () => { await launchCampaign(c.id); router.refresh(); })}>
                {c.status === "paused" ? "Resume campaign" : "Launch campaign"}
              </button>
            )}
            {c.status === "active" && (
              <div className="space-y-3">
                <div className="rounded-lg bg-[var(--los-success-soft)] px-4 py-2.5 text-[13.5px] text-[var(--los-success)]">
                  Live — collecting leads.
                </div>
                <div>
                  <Label>Public page</Label>
                  <a href={c.publicUrl} target="_blank" className="break-all text-[13.5px] text-[var(--los-brand)] underline">{c.publicUrl}</a>
                </div>
                <div>
                  <Label>Embed on your website</Label>
                  <code className="block break-all rounded-lg bg-[var(--los-surface-2)] p-2.5 text-[12px]">
                    {`<iframe src="${c.publicUrl}?embed=1" style="width:100%;min-height:560px;border:0"></iframe>`}
                  </code>
                </div>
                {page.whatsappNumber && (
                  <div>
                    <Label>WhatsApp click-to-chat</Label>
                    <a
                      className="break-all text-[13.5px] text-[var(--los-brand)] underline"
                      target="_blank"
                      href={`https://wa.me/${page.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi! I'm interested in ${offer.product || "your offer"}.`)}`}
                    >
                      wa.me link
                    </a>
                  </div>
                )}
                {canManage && (
                  <GhostButton onClick={() => start(async () => { await setCampaignStatus(c.id, "paused"); router.refresh(); })}>Pause</GhostButton>
                )}
              </div>
            )}
          </Card>

          {(c.status === "active" || c.status === "paused") && (
            <TrackingPanel campaignId={c.id} publicUrl={c.publicUrl} links={c.trackingLinks} canManage={canManage} />
          )}

          {props.submissions.length > 0 && (
            <Card>
              <div className="border-b border-[var(--los-line)] px-5 py-3 text-[15px] font-bold">Recent submissions</div>
              <ul className="divide-y divide-[var(--los-line)]">
                {props.submissions.map((s) => {
                  const d = JSON.parse(s.data) as Record<string, string>;
                  return (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-[13.5px]">
                      <div>
                        {s.leadId ? (
                          <Link href={`/app/leads/${s.leadId}`} className="font-medium text-[var(--los-brand)] hover:underline">
                            {[d.firstName, d.lastName].filter(Boolean).join(" ") || d.email || d.phone}
                          </Link>
                        ) : (
                          <span>{d.email ?? d.phone ?? "—"}</span>
                        )}
                        {s.trackingCode && <Badge>via {s.trackingCode}</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-[12.5px] text-[var(--los-faint)]">
                        <Badge tone={s.status === "accepted" ? "success" : s.status === "duplicate_updated" ? "warn" : "danger"}>{s.status.replace(/_/g, " ")}</Badge>
                        {s.createdAt}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function TrackingPanel(props: { campaignId: string; publicUrl: string; links: { id: string; label: string; code: string }[]; canManage: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(addTrackingLink, {});
  return (
    <Card className="p-5">
      <div className="mb-2 text-[15px] font-bold">Tracking links (posts, QR codes, partners)</div>
      {state.error && <p className="text-[13px] text-[var(--los-danger)]">{state.error}</p>}
      <ul className="mb-3 space-y-1.5 text-[13px]">
        {props.links.map((l) => (
          <li key={l.id} className="break-all">
            <span className="font-medium">{l.label}:</span>{" "}
            <span className="text-[var(--los-brand)]">{props.publicUrl}?t={l.code}</span>
          </li>
        ))}
        {props.links.length === 0 && <li className="text-[var(--los-faint)]">No tracking links yet.</li>}
      </ul>
      {props.canManage && (
        <form action={action} className="flex items-end gap-2">
          <input type="hidden" name="campaignId" value={props.campaignId} />
          <div className="flex-1">
            <Label>New link label</Label>
            <Input name="label" placeholder="Instagram bio / Event QR / Partner X" />
          </div>
          <SubmitButton>Add</SubmitButton>
        </form>
      )}
      <p className="mt-2 text-[12px] text-[var(--los-faint)]">
        For QR campaigns, generate a QR image from any tracking link URL with your preferred tool.
      </p>
    </Card>
  );
}
