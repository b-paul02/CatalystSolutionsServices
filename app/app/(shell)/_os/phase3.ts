"use server";

// Server actions for the Phase 3 first-party features (WP-40..51). Each returns a message on refusal.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/audit/db";
import { requireOrg } from "@/lib/leados/auth";
import { WorkError, getWorkItem } from "@/lib/os/work";

type State = { error?: string; ok?: string; href?: string };
const str = (form: FormData, key: string, max = 4000) => String(form.get(key) ?? "").trim().slice(0, max);
async function run(fn: () => Promise<State | void>, paths: string[] = ["/app"]): Promise<State> {
  try { const out = await fn(); for (const p of paths) revalidatePath(p, "layout"); return out ?? { ok: "Saved." }; }
  catch (e) { if (e instanceof WorkError) return { error: e.message }; if (e instanceof Error && (e.name === "LosAuthError" || /address|internal|https/i.test(e.message))) return { error: e.message }; throw e; }
}

// ── WP-40 site copy ──
export async function siteCopySave(_p: State, form: FormData): Promise<State> {
  return run(async () => {
    const a = await requireOrg();
    const { saveContent } = await import("@/lib/os/siteContent");
    const row = await saveContent(a, str(form, "id", 60), str(form, "key", 80), str(form, "value", 20_000), str(form, "locale", 10) || "en");
    return { ok: `Saved ${row.key} (v${row.version}). The site picks it up within a minute.`, href: `/app/work/${str(form, "id", 60)}/site-copy?saved=${encodeURIComponent(row.key)}` };
  });
}

// ── WP-41 automated QA ──
export async function qaStart(_p: State, form: FormData): Promise<State> {
  return run(async () => {
    const a = await requireOrg("work.review", "work.execute");
    const id = str(form, "id", 60);
    const staging = str(form, "stagingUrl", 500);
    if (staging) {
      const item = await getWorkItem(a, id);
      const payload = item.payload ? (JSON.parse(item.payload) as Record<string, unknown>) : {};
      const { safeUrl } = await import("@/lib/os/automation/definition");
      await db.cosWorkItem.update({ where: { id: item.id }, data: { payload: JSON.stringify({ ...payload, stagingUrl: safeUrl(staging).toString() }) } });
    }
    const { startQa } = await import("@/lib/os/qaRun");
    await startQa(a, id);
    return { ok: "Automated QA queued — results land on this page in a minute or two." };
  }, ["/app/work"]);
}

// ── WP-42 pins ──
export async function pinAdd(_p: State, form: FormData): Promise<State> {
  return run(async () => {
    const a = await requireOrg("work.view", "work.execute");
    const { addPin } = await import("@/lib/os/pins");
    await addPin(a, { subject: str(form, "subject", 12) === "variant" ? "variant" : "work_item", subjectId: str(form, "subjectId", 60), x: Number(str(form, "x", 10)), y: Number(str(form, "y", 10)), text: str(form, "text", 2000) });
    return { ok: "Pin added." };
  }, ["/app/work", "/app/content"]);
}
export async function pinResolve(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await requireOrg(); const { resolvePin } = await import("@/lib/os/pins"); await resolvePin(a, str(form, "id", 60)); return { ok: "Resolved." }; }, ["/app/work", "/app/content"]);
}

// ── WP-44 chat inbox ──
export async function chatReply(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await requireOrg("leads.contact", "work.execute"); const { staffReply } = await import("@/lib/os/chat"); await staffReply(a, str(form, "id", 60), str(form, "text", 2000)); return { ok: "Sent." }; }, ["/app/outreach/inbox"]);
}
export async function chatClose(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await requireOrg("leads.contact", "work.execute"); const { closeConversation } = await import("@/lib/os/chat"); await closeConversation(a, str(form, "id", 60)); return { ok: "Closed." }; }, ["/app/outreach/inbox"]);
}

// ── WP-46 enrichment ──
export async function enrichStart(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await requireOrg("leads.edit"); const { startEnrichment } = await import("@/lib/leados/enrich"); await startEnrichment(a, str(form, "leadId", 60)); return { ok: "Enrichment queued — fields appear here after the next scheduler tick." }; }, ["/app/leads"]);
}
export async function enrichAccept(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await requireOrg("leads.edit"); const { acceptFields } = await import("@/lib/leados/enrich"); const n = await acceptFields(a, str(form, "leadId", 60), form.getAll("field").map(String)); return { ok: `${n} field(s) applied to the company.` }; }, ["/app/leads"]);
}

// ── WP-47 competitors ──
export async function competitorAdd(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await requireOrg("strategy.manage", "os.settings"); const { addCompetitor } = await import("@/lib/os/competitors"); await addCompetitor(a, str(form, "domain", 253)); return { ok: "Competitor added — first observation on the next weekly run (or press Observe now)." }; }, ["/app/strategy"]);
}
export async function competitorRemove(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await requireOrg("strategy.manage", "os.settings"); const { removeCompetitor } = await import("@/lib/os/competitors"); await removeCompetitor(a, str(form, "id", 60)); return { ok: "Removed." }; }, ["/app/strategy"]);
}
export async function competitorObserve(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await requireOrg("strategy.manage", "os.settings"); const { observeNow } = await import("@/lib/os/competitors"); await observeNow(a, str(form, "id", 60)); return { ok: "Observation queued." }; }, ["/app/strategy"]);
}

// ── WP-48 AI-search visibility ──
export async function questionAdd(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await requireOrg("strategy.manage", "os.settings", "campaigns.manage"); const { addQuestion } = await import("@/lib/os/aiVisibility"); await addQuestion(a, str(form, "question", 300)); return { ok: "Question tracked — first observation on the weekly run." }; }, ["/app/search"]);
}
export async function questionRemove(_p: State, form: FormData): Promise<State> {
  return run(async () => { const a = await requireOrg("strategy.manage", "os.settings", "campaigns.manage"); const { removeQuestion } = await import("@/lib/os/aiVisibility"); await removeQuestion(a, str(form, "id", 60)); return { ok: "Removed." }; }, ["/app/search"]);
}
export async function questionsObserve(_p: State, _form: FormData): Promise<State> {
  return run(async () => { const a = await requireOrg("work.execute", "strategy.manage"); const { observeQuestions } = await import("@/lib/os/aiVisibility"); const n = await observeQuestions(a.orgId, new Date(), true); return { ok: `${n} question(s) observed.` }; }, ["/app/search"]);
}

// ── WP-49 reviews ──
export async function reviewsSync(_p: State, _form: FormData): Promise<State> {
  return run(async () => { const a = await requireOrg("os.settings", "work.execute"); const { syncReviews } = await import("@/lib/os/reviews"); const r = await syncReviews(a.orgId); return { ok: `${r.synced} review(s) read from Google Business Profile.` }; }, ["/app/results"]);
}

// ── WP-45 WhatsApp templates ──
export async function waTemplatesSync(_p: State, _form: FormData): Promise<State> {
  return run(async () => { const a = await requireOrg("leads.contact", "campaigns.manage", "os.settings"); const { syncWaTemplates } = await import("@/lib/os/waTemplates"); const n = await syncWaTemplates(a); return { ok: `${n} WhatsApp template(s) synced with their approval status.` }; }, ["/app/outreach"]);
}
