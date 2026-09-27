// WP-40 · site copy editor: append-only versions per (project work item, key, locale). The client's site reads the
// latest values through a public JSON route cached by tag; a save revalidates the tag. Client role `site.edit`.
import { revalidateTag, unstable_cache } from "next/cache";
import { db } from "@/lib/audit/db";
import { can } from "@/lib/leados/rbac";
import { assertWritable, getWorkItem, WorkError, type WorkActor } from "./work";

export const siteTag = (workItemId: string) => `site:${workItemId}`;

export async function latestContent(workItemId: string, locale = "en") {
  const rows = await db.cosSiteContent.findMany({ where: { workItemId, locale }, orderBy: [{ key: "asc" }, { version: "desc" }] });
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)));
}

/** Cached read for the client's site (public, values only). */
export const publicSiteContent = (workItemId: string, locale: string) =>
  unstable_cache(async () => { const rows = await latestContent(workItemId, locale); return Object.fromEntries(rows.map((r) => [r.key, r.value])); }, ["site-content", workItemId, locale], { tags: [siteTag(workItemId)] })();

export async function saveContent(actor: WorkActor, workItemId: string, key: string, value: string, locale = "en") {
  if (!can(actor.role, "site.edit") && !can(actor.role, "work.execute")) throw new WorkError("Forbidden.");
  await assertWritable(actor.orgId);
  const item = await getWorkItem(actor, workItemId);
  if (item.type !== "project") throw new WorkError("Site copy belongs to a website project.");
  const k = key.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 80);
  if (!k) throw new WorkError("Key must be letters, digits, dot, dash or underscore.");
  const loc = /^[a-z]{2}(-[A-Z]{2})?$/.test(locale) ? locale : "en";
  const last = await db.cosSiteContent.findFirst({ where: { workItemId, key: k, locale: loc }, orderBy: { version: "desc" } });
  if (last && last.value === value) return last;
  const row = await db.cosSiteContent.create({ data: { orgId: actor.orgId, workItemId, key: k, locale: loc, value: value.slice(0, 20_000), version: (last?.version ?? 0) + 1, createdById: actor.userId } });
  await db.cosWorkEvent.create({ data: { orgId: actor.orgId, workItemId, actorId: actor.userId, actorType: "user", kind: "edit", data: JSON.stringify({ siteContent: k, version: row.version }) } });
  revalidateTag(siteTag(workItemId));
  return row;
}

export async function contentHistory(actor: WorkActor, workItemId: string, key: string, locale = "en") {
  await getWorkItem(actor, workItemId);
  return db.cosSiteContent.findMany({ where: { workItemId, key, locale }, orderBy: { version: "desc" }, take: 20 });
}
