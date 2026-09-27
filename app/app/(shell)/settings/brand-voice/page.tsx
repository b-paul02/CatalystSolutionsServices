import { requireOrgPage } from "@/lib/os/guard";
import { can } from "@/lib/leados/rbac";
import { getBrandRules, readingGrade } from "@/lib/os/brand";
import { Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import GrowthStep from "@/components/os/GrowthStep";
import { field } from "@/components/os/bits";
import { brandRulesSave } from "./actions";

export const metadata = { title: "Brand voice" };

// WP-21 · Settings → Brand voice: banned / required phrases, a reading-grade ceiling, tone notes, brand colour.
// Evaluated in every copy check; violations show inline in the variant editor.
export default async function BrandVoicePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const actor = await requireOrgPage();
  const sp = await searchParams;
  const rules = await getBrandRules(actor.orgId);
  const edit = can(actor.role, "os.settings");
  const sample = "We help local clinics get more of the patients they want, without guesswork. Clear reports every month.";
  return (
    <div className="space-y-5">
      {sp.saved && <GrowthStep done="Brand rules saved." step={{ pillar: "digital_visibility", metric: "impressions", metricLabel: "Impressions of on-brand content", action: { kind: "work_item", label: "Review open drafts against the rules", title: "Check open content drafts against the brand voice rules", type: "task", serviceSlug: "content" } }} />}
      <Card className="p-5 text-[13.5px]">
        <div className="mb-1 text-[15px] font-bold">Brand voice rules</div>
        <p className="mb-3 text-[13px] text-[var(--los-muted)]">Checked on every draft and channel version. The reading grade uses a syllable heuristic (Flesch–Kincaid), so treat it as a guide, not a measurement. Example: the sentence “{sample}” scores grade {readingGrade(sample) ?? "—"}.</p>
        {edit ? (
          <ActionForm action={brandRulesSave} submit="Save rules" className="grid gap-3 md:grid-cols-2">
            <div><Label>Never say (one per line)</Label><textarea name="banned" rows={5} className={field} defaultValue={rules.bannedPhrases.join("\n")} placeholder={"cheap\nbest in class\nguaranteed"} /></div>
            <div><Label>Always include when it fits (one per line)</Label><textarea name="required" rows={5} className={field} defaultValue={rules.requiredPhrases.join("\n")} placeholder={"book a consultation"} /></div>
            <div><Label>Maximum reading grade (blank = no limit)</Label><Input name="maxReadingGrade" type="number" min={3} max={18} defaultValue={rules.maxReadingGrade ?? ""} /></div>
            <div><Label>Brand colour (used by graphic templates)</Label><Input name="color" type="color" defaultValue={rules.color ?? "#6d28d9"} className="!h-[38px] !p-1" /></div>
            <div className="md:col-span-2"><Label>Tone notes (shown to writers and given to the model)</Label><textarea name="toneNotes" rows={3} className={field} defaultValue={rules.toneNotes ?? ""} placeholder="Warm, plain, no jargon. Second person. Short sentences." /></div>
          </ActionForm>
        ) : (
          <dl className="grid gap-2 md:grid-cols-2"><div><dt className="text-[12px] text-[var(--los-faint)]">Never say</dt><dd>{rules.bannedPhrases.join(", ") || "—"}</dd></div><div><dt className="text-[12px] text-[var(--los-faint)]">Always include</dt><dd>{rules.requiredPhrases.join(", ") || "—"}</dd></div><div><dt className="text-[12px] text-[var(--los-faint)]">Max reading grade</dt><dd>{rules.maxReadingGrade ?? "no limit"}</dd></div><div><dt className="text-[12px] text-[var(--los-faint)]">Tone</dt><dd>{rules.toneNotes ?? "—"}</dd></div></dl>
        )}
      </Card>
    </div>
  );
}
