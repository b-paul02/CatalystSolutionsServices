// GrowthOS v2 data operations. DRY-RUN by default; nothing is written without --apply.
//   node --experimental-strip-types --env-file=.env.development.local scripts/growthos-v2-ops.ts <command> [--apply]
// Commands:
//   check-links  read-only report of legacy rows whose parent / org no longer exists (run BEFORE adding constraints)
//   backfill     deliveredAt from the first "delivered" event; one engagement per existing workspace; contracts/goals linked to it
//   rotate-keys  re-encrypt legacy ciphertext under LEADOS_SECRET (k2). Needs the OLD key available as
//                LEADOS_LEGACY_SECRET (or ADMIN_SESSION_SECRET if that is what the deployment used).
// Outside production the database must be local (lib/dbGuard). For production set NODE_ENV=production
// deliberately, take a backup first, and run the dry-run before --apply. Never prints secrets or personal data.
import { PrismaClient } from "@prisma/client";
import { assertSafeDatabase } from "../lib/dbGuard.ts";
import { decryptField, encryptField, needsReencrypt } from "../lib/leados/crypto.ts";

assertSafeDatabase();
const db = new PrismaClient();
const [cmd, ...flags] = process.argv.slice(2);
const apply = flags.includes("--apply");
const say = (s: string) => console.log(`${apply ? "[apply]" : "[dry-run]"} ${s}`);

async function checkLinks() {
  const q = (sql: string) => db.$queryRawUnsafe<{ n: bigint }[]>(sql).then((r) => Number(r[0].n));
  const checks: [string, string][] = [
    ["CosWorkItem → LosOrg", `select count(*) n from "CosWorkItem" w left join "LosOrg" o on o.id = w."orgId" where o.id is null`],
    ["CosWorkItem.parentId → CosWorkItem", `select count(*) n from "CosWorkItem" w left join "CosWorkItem" p on p.id = w."parentId" where w."parentId" is not null and p.id is null`],
    ["CosWorkItem.parentId crosses orgs", `select count(*) n from "CosWorkItem" w join "CosWorkItem" p on p.id = w."parentId" where p."orgId" <> w."orgId"`],
    ["CosWorkItem.contractId → CosContract", `select count(*) n from "CosWorkItem" w left join "CosContract" c on c.id = w."contractId" where w."contractId" is not null and c.id is null`],
    ["CosWorkItem.findingId → CosFinding", `select count(*) n from "CosWorkItem" w left join "CosFinding" f on f.id = w."findingId" where w."findingId" is not null and f.id is null`],
    ["CosFinding.auditRunId → CosAuditRun", `select count(*) n from "CosFinding" f left join "CosAuditRun" r on r.id = f."auditRunId" where f."auditRunId" is not null and r.id is null`],
    ["CosContract → LosOrg", `select count(*) n from "CosContract" c left join "LosOrg" o on o.id = c."orgId" where o.id is null`],
    ["CosApproval.workItemId crosses orgs", `select count(*) n from "CosApproval" a join "CosWorkItem" w on w.id = a."workItemId" where w."orgId" <> a."orgId"`],
    ["CosConnection → LosOrg", `select count(*) n from "CosConnection" c left join "LosOrg" o on o.id = c."orgId" where o.id is null`],
    ["LosFormSubmission.leadId → LosLead", `select count(*) n from "LosFormSubmission" s left join "LosLead" l on l.id = s."leadId" where s."leadId" is not null and l.id is null`],
    ["LosTask.leadId → LosLead", `select count(*) n from "LosTask" t left join "LosLead" l on l.id = t."leadId" where t."leadId" is not null and l.id is null`],
  ];
  let bad = 0;
  for (const [label, sql] of checks) { const n = await q(sql); bad += n; console.log(`${n === 0 ? "ok  " : "FIX "} ${label}: ${n}`); }
  console.log(bad === 0 ? "\nNo orphans — these relationships are safe to constrain." : `\n${bad} row(s) need reconciling before foreign keys are added.`);
}

async function backfill() {
  // 1. deliveredAt = the FIRST time the item reached "delivered" (append-only events are the source of truth)
  const items = await db.cosWorkItem.findMany({ where: { deliveredAt: null, state: { in: ["delivered", "verified", "closed"] } }, select: { id: true } });
  let dated = 0;
  for (const it of items) {
    const ev = await db.cosWorkEvent.findFirst({ where: { workItemId: it.id, toState: "delivered" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
    if (!ev) continue;
    dated++;
    if (apply) await db.cosWorkItem.update({ where: { id: it.id }, data: { deliveredAt: ev.createdAt } });
  }
  say(`deliveredAt: ${dated} of ${items.length} delivered item(s) have a delivered event to date them from`);

  // 2. every existing workspace gets ONE engagement carrying its history; contracts, goals and work link to it
  const workspaces = await db.cosWorkspace.findMany();
  let made = 0;
  for (const ws of workspaces) {
    if (await db.cosEngagement.findFirst({ where: { orgId: ws.orgId } })) continue;
    const [org, active, any] = await Promise.all([
      db.losOrg.findUnique({ where: { id: ws.orgId }, select: { name: true } }),
      db.cosContract.findFirst({ where: { orgId: ws.orgId, status: "active" }, orderBy: { signedAt: "asc" } }),
      db.cosContract.findFirst({ where: { orgId: ws.orgId }, orderBy: { createdAt: "desc" } }),
    ]);
    const stage = active ? "active" : any?.status === "proposed" ? "proposal" : any?.status === "ended" ? "completed" : any?.status === "declined" ? "declined" : "prospect";
    made++;
    if (!apply) continue;
    const e = await db.cosEngagement.create({ data: { orgId: ws.orgId, name: `${org?.name ?? "Client"} — engagement`, entrySource: ws.partnerId ? "partner" : ws.sourceLeadId ? "audit" : "direct", sourceLeadId: ws.sourceLeadId, stage, startsAt: active?.signedAt ?? null, demo: ws.demo } });
    await db.cosEngagementEvent.create({ data: { orgId: ws.orgId, engagementId: e.id, actorType: "system", kind: "stage", toValue: stage, reason: "Created by the v2 backfill from existing contracts" } });
    await db.cosContract.updateMany({ where: { orgId: ws.orgId, engagementId: null }, data: { engagementId: e.id } });
    await db.cosGoal.updateMany({ where: { orgId: ws.orgId, engagementId: null }, data: { engagementId: e.id } });
    await db.cosWorkItem.updateMany({ where: { orgId: ws.orgId, engagementId: null }, data: { engagementId: e.id } });
  }
  say(`engagements: ${made} workspace(s) without an engagement`);
}

async function rotateKeys() {
  const targets: { name: string; rows: () => Promise<{ id: string; values: Record<string, string | null> }[]>; save: (id: string, data: Record<string, string>) => Promise<unknown> }[] = [
    { name: "CosConnection", rows: async () => (await db.cosConnection.findMany({ select: { id: true, accessTokenEnc: true, refreshTokenEnc: true } })).map((r) => ({ id: r.id, values: { accessTokenEnc: r.accessTokenEnc, refreshTokenEnc: r.refreshTokenEnc } })), save: (id, data) => db.cosConnection.update({ where: { id }, data }) },
    { name: "LosUser.mfaSecretEnc", rows: async () => (await db.losUser.findMany({ where: { mfaSecretEnc: { not: null } }, select: { id: true, mfaSecretEnc: true } })).map((r) => ({ id: r.id, values: { mfaSecretEnc: r.mfaSecretEnc } })), save: (id, data) => db.losUser.update({ where: { id }, data }) },
  ];
  for (const t of targets) {
    let legacy = 0, ok = 0, unreadable = 0;
    for (const row of await t.rows()) {
      const data: Record<string, string> = {};
      for (const [field, value] of Object.entries(row.values)) {
        if (!value || !needsReencrypt(value)) continue;
        legacy++;
        try { data[field] = encryptField(decryptField(value)); ok++; } catch { unreadable++; } // wrong/missing old key: left untouched
      }
      if (apply && Object.keys(data).length) await t.save(row.id, data);
    }
    say(`${t.name}: ${legacy} legacy value(s), ${ok} re-encryptable, ${unreadable} unreadable with the configured keys (left untouched)`);
  }
  console.log("Other encrypted columns (consent evidence, integration configs) decrypt through the same legacy path and can be added here the same way.");
}

const run = cmd === "check-links" ? checkLinks : cmd === "backfill" ? backfill : cmd === "rotate-keys" ? rotateKeys : null;
if (!run) { console.error("usage: growthos-v2-ops.ts check-links | backfill [--apply] | rotate-keys [--apply]"); process.exit(1); }
run().then(() => db.$disconnect()).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await db.$disconnect(); process.exit(1); });
