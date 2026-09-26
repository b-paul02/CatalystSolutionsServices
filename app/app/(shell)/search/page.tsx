import { can } from "@/lib/leados/rbac";
import { requireModule } from "@/lib/os/guard";
import { aiAvailable } from "@/lib/os/ai";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import Studio from "@/components/os/Studio";
import { newSeoBrief } from "../_os/actions";

export const metadata = { title: "Search Studio" };

export default async function SearchPage() {
  const { actor } = await requireModule("search", "work.view");
  return (
    <Studio
      actor={actor} title="Search Studio" studio="Search" provider="gsc"
      sub="Search Console data, keyword opportunities and briefs — every change validated by a specialist before it ships."
      metrics={[{ key: "clicks", label: "Clicks" }, { key: "impressions", label: "Impressions" }, { key: "ai_citations", label: "AI citations seen" }, { key: "indexed_pages", label: "Indexed pages" }]}
      note="AI-citation checks are dated observations, not guarantees."
      extras={can(actor.role, "work.manage") ? (
        <Card className="p-4">
          <div className="mb-2 text-[15px] font-bold">Keyword opportunities</div>
          <p className="mb-2 text-[13px] text-[var(--los-muted)]">Striking-distance, cannibalisation and no-click queries from Search Console, and topic clusters you can add to a brief. No search volumes.</p>
          <a className="text-[13px] font-semibold text-[var(--los-brand)] hover:underline" href="/app/search/keywords">Open keyword opportunities →</a>
          <div className="mb-2 mt-4 text-[15px] font-bold">New content brief</div>
          {aiAvailable() ? (
            <ActionForm action={newSeoBrief} submit="Draft brief" className="space-y-2 text-[13px]">
              <div><Label>Target keyword</Label><Input name="keyword" required placeholder="b2b lead generation agency india" /></div>
              <p className="text-[12px] text-[var(--los-faint)]">Creates a content work item with intent, outline, questions and expertise flags for the specialist to validate.</p>
            </ActionForm>
          ) : <p className="text-[13px] text-[var(--los-warn)]">AI is not configured (LLM_API_KEY).</p>}
        </Card>
      ) : null}
    />
  );
}
