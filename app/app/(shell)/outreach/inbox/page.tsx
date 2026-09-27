import Link from "next/link";
import { requireOrgPage } from "@/lib/os/guard";
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { entitlements } from "@/lib/os/entitlements";
import { Badge, Card } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import GrowthStep from "@/components/os/GrowthStep";
import { field, PageHeader } from "@/components/os/bits";
import { chatClose, chatReply } from "../../_os/phase3";
import Poll from "./Poll";

export const metadata = { title: "Chat inbox" };

// WP-44 · staff / client inbox: conversations left, thread right, refreshes every 5 s while open.
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string; closed?: string }> }) {
  const actor = await requireOrgPage("leads.contact", "work.execute", "leads.view");
  const sp = await searchParams;
  const ent = await entitlements(actor.orgId);
  const convs = await db.cosConversation.findMany({ where: { orgId: actor.orgId, status: sp.closed ? "closed" : "open", ...(ent.demo ? {} : { demo: false }) }, orderBy: { lastAt: "desc" }, take: 50, include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const current = sp.c ? await db.cosConversation.findFirst({ where: { id: sp.c, orgId: actor.orgId }, include: { messages: { orderBy: { createdAt: "asc" }, take: 200 } } }) : null;
  const reply = (can(actor.role, "leads.contact") || can(actor.role, "work.execute")) && ent.accessMode === "active";
  return (
    <div className="space-y-4">
      <Poll />
      <PageHeader title="Chat inbox" sub="Messages from the chat bubble on your site. Visitors are identified by a token, not a cookie; an email they offer links a lead."><div className="flex gap-2 text-[13px]"><Link href="/app/outreach/inbox" className={`rounded-lg border px-3 py-1.5 ${sp.closed ? "border-[var(--los-line)]" : "border-[var(--los-brand)]"}`}>Open</Link><Link href="/app/outreach/inbox?closed=1" className={`rounded-lg border px-3 py-1.5 ${sp.closed ? "border-[var(--los-brand)]" : "border-[var(--los-line)]"}`}>Closed</Link></div></PageHeader>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="p-2 text-[13px]">
          {convs.length === 0 && <p className="p-3 text-[var(--los-faint)]">No {sp.closed ? "closed" : "open"} conversations. Install the bubble: <code>{`<script src="/s/chat.js" data-workspace="${actor.orgId}"></script>`}</code></p>}
          <ul className="divide-y divide-[var(--los-line)]">{convs.map((c) => <li key={c.id}><Link href={`/app/outreach/inbox?c=${c.id}${sp.closed ? "&closed=1" : ""}`} className={`block rounded-lg px-3 py-2 ${current?.id === c.id ? "bg-[var(--los-surface-2)]" : ""}`}><div className="flex items-center justify-between"><span className="font-semibold">{c.email ?? "Visitor"}</span><span className="text-[11.5px] text-[var(--los-faint)]">{c.lastAt.toISOString().slice(11, 16)}Z</span></div><div className="truncate text-[var(--los-muted)]">{c.messages[0]?.text ?? ""}</div>{c.page && <div className="truncate text-[11.5px] text-[var(--los-faint)]">{c.page}</div>}</Link></li>)}</ul>
        </Card>
        <Card className="flex min-h-[420px] flex-col p-4 text-[13.5px]">
          {!current ? <p className="text-[var(--los-faint)]">Pick a conversation.</p> : (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><b>{current.email ?? "Visitor"}</b> {current.leadId && <Link href={`/app/leads/${current.leadId}`} className="ml-2 text-[12.5px] underline">Open lead</Link>}<Badge tone={current.status === "open" ? "success" : "neutral"}>{current.status}</Badge></div>{reply && current.status === "open" && <ActionForm action={chatClose} submit="Close" tone="ghost" hidden={{ id: current.id }} />}</div>
              <div className="flex flex-1 flex-col gap-2 overflow-auto rounded-lg border border-[var(--los-line)] p-3">{current.messages.map((m) => <div key={m.id} className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 ${m.from === "visitor" ? "self-start bg-[var(--los-surface-2)]" : "self-end bg-[var(--los-brand)] text-white"}`}>{m.text}<div className={`mt-0.5 text-[10.5px] ${m.from === "visitor" ? "text-[var(--los-faint)]" : "text-white/70"}`}>{m.createdAt.toISOString().slice(0, 16).replace("T", " ")}Z</div></div>)}</div>
              {reply && current.status === "open" ? <ActionForm action={chatReply} submit="Send" className="mt-2 flex items-end gap-2" hidden={{ id: current.id }}><textarea name="text" required maxLength={2000} rows={2} className={field} placeholder="Reply…" /></ActionForm> : <p className="mt-2 text-[12px] text-[var(--los-faint)]">{current.status === "closed" ? "This conversation is closed." : "You can read but not reply."}</p>}
              {current.status === "closed" && <GrowthStep done="Conversation closed." step={{ pillar: "client_acquisition", metric: "leads", metricLabel: "Enquiries", action: current.leadId ? { kind: "work_item", label: "Follow up this lead", title: `Follow up chat lead ${current.email ?? current.id}`, type: "task" } : { kind: "goal", label: "Set an enquiries goal", title: "More enquiries from the site chat", unit: "per month", horizon: "90 days" } }} />}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
