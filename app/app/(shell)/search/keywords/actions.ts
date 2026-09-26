"use server";

import { revalidatePath } from "next/cache";
import { requireOrgAction } from "@/lib/leados/auth";
import { aiAvailable } from "@/lib/os/ai";
import { addTopicToBrief, clusterTopics, latestQueryRows, type Topic } from "@/lib/os/keywords";
import { WorkError } from "@/lib/os/work";

type State = { error?: string; ok?: string };
const PATH = "/app/search/keywords";
const fail = (e: unknown): State => { if (e instanceof WorkError || (e instanceof Error && e.name === "LosAuthError")) return { error: e.message }; throw e; };

/** WP-14 · cluster the current rows; every surviving topic is saved as a source so it can be added to a brief. */
export async function clusterKeywords(_p: State, _form: FormData): Promise<State> {
  const actor = await requireOrgAction("work.manage", "strategy.manage"); if ("error" in actor) return actor;
  if (!aiAvailable()) return { error: "AI is not configured (LLM_API_KEY)." };
  try {
    const { rows } = await latestQueryRows(actor.orgId);
    if (rows.length === 0) return { error: "No Search Console rows yet." };
    const { topics, dropped } = await clusterTopics(actor.orgId, rows);
    for (const t of topics) await addTopicToBrief(actor, t, rows, null);
    revalidatePath(PATH);
    return { ok: `${topics.length} topic(s) saved as sources${dropped.length ? ` · ${dropped.length} invented citation(s) dropped` : ""}.` };
  } catch (e) { return fail(e); }
}

export async function addTopicToBriefAction(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction("work.manage", "strategy.manage"); if ("error" in actor) return actor;
  try {
    let topic: Topic;
    try { topic = JSON.parse(String(form.get("topic") ?? "")) as Topic; } catch { return { error: "Malformed topic." }; }
    const { rows } = await latestQueryRows(actor.orgId);
    const known = new Set(rows.map((r) => r.query));
    topic.queries = (topic.queries ?? []).filter((q) => known.has(q));
    if (!topic.name || topic.queries.length === 0) return { error: "That topic cites no query from your rows." };
    await addTopicToBrief(actor, topic, rows, String(form.get("workItemId") ?? "") || null);
    revalidatePath(PATH);
    return { ok: "Added to the brief as a source." };
  } catch (e) { return fail(e); }
}
