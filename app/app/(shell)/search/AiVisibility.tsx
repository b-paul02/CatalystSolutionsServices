import { visibilitySummary } from "@/lib/os/aiVisibility";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import GrowthStep from "@/components/os/GrowthStep";
import { questionAdd, questionRemove, questionsObserve } from "../_os/phase3";

// WP-48 · tracked questions and weekly observations from the configured LLM provider: counts, never a ranking claim.
export default async function AiVisibility({ orgId, canManage }: { orgId: string; canManage: boolean }) {
  const rows = await visibilitySummary(orgId);
  return (
    <Card className="mb-4 p-4 text-[13.5px]">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><div className="text-[15px] font-bold">AI-search visibility</div>{canManage && rows.length > 0 && <ActionForm action={questionsObserve} submit="Observe now" tone="ghost" />}</div>
      <p className="mb-2 text-[12.5px] text-[var(--los-muted)]">Each week the AI provider answers your tracked questions; we count whether your brand and tracked competitors are named and which pages it cites. One provider, dated observations — not a market share.</p>
      {rows.length === 0 ? <p className="text-[var(--los-faint)]">No questions tracked yet.</p> : (
        <table className="w-full text-[13px]"><thead><tr className="text-left text-[var(--los-faint)]"><th>Question</th><th>Runs</th><th>Brand named</th><th>Latest</th><th></th></tr></thead><tbody>{rows.map((r) => <tr key={r.id} className="border-t border-[var(--los-line)] align-top"><td className="py-1 pr-2">{r.question}</td><td className="py-1 pr-2">{r.runs}</td><td className="py-1 pr-2">{r.runs ? `${r.brandMentions} of ${r.runs}` : "—"}</td><td className="py-1 pr-2 text-[12px] text-[var(--los-muted)]">{r.latest ? <>{r.latest.at.toISOString().slice(0, 10)} · {r.latest.brandMentioned ? "named" : "not named"}{r.latest.competitors.length ? ` · competitors: ${r.latest.competitors.join(", ")}` : ""}{r.latest.citedUrls.length ? ` · cites ${r.latest.citedUrls.length} page(s)` : ""}</> : "not run yet"}</td><td className="py-1">{canManage && <ActionForm action={questionRemove} submit="×" tone="ghost" hidden={{ id: r.id }} />}</td></tr>)}</tbody></table>
      )}
      {canManage && <ActionForm action={questionAdd} submit="Track question" tone="ghost" className="mt-2 flex flex-wrap items-end gap-2"><div className="min-w-[280px] flex-1"><Label>Question a buyer would ask an AI assistant</Label><Input name="question" required placeholder="Which dental clinic in Pune offers invisible aligners?" /></div></ActionForm>}
      {rows.some((r) => r.runs > 0) && <GrowthStep done="AI-search observations recorded." step={{ pillar: "digital_visibility", metric: "search.position", metricLabel: "Tracked search positions", action: { kind: "work_item", label: "Brief a page that answers the question", title: `Answer page for: ${rows.find((r) => r.runs > 0)!.question.slice(0, 80)}`, type: "content" } }} />}
    </Card>
  );
}
