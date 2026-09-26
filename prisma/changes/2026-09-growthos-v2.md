# Schema change 2026-09 — GrowthOS v2 (additive)

Applied so far: **local `growthos_dev` and `growthos_test` only.** Production has NOT been touched.
The repo uses `prisma db push` (no migrations folder); this note is the reviewed record of what that push will do.

## What changes
**New tables (22)** — all `Cos*`, each with a FK to `LosOrg` (cascade; orgs are only deleted by the demo wipe) and to its parent:
`CosEngagement`, `CosEngagementEvent`, `CosBusinessProfile`, `CosSource`, `CosClaim`, `CosChecklistItem`, `CosDependency`,
`CosCampaign`, `CosContentVariant`, `CosRevision`, `CosAsset`, `CosAssetVersion`, `CosPublication`, `CosPublishAttempt`,
`CosMetricSnapshot`, `CosOpportunity`, `CosCycle`, `CosCommercialRecord`, `CosPaymentEvent`, `CosAiUsage`, `CosNotification`, `CosHeartbeat`.

**New nullable / defaulted columns on existing tables** (no rewrite of existing data):
- `LosLead`: `marketingCampaignId`, `variantId`, `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `attributionKind` (default `unknown`), `selfReportedSource`; index `(orgId, marketingCampaignId)`
- `LosCampaign`: `marketingCampaignId`
- `CosWorkspace`: `timezone` (default `UTC`), `currency`, `accessMode` (default `active`)
- `CosContract`: `engagementId` · `CosGoal`: `engagementId`, `focus`
- `CosWorkItem`: `engagementId`, `goalId`, `campaignId`, `cycleId`, `responsibility` (default `catalyst`), `assignRole`, `acceptanceCriteria`, `measure`, `deliveredAt`; three indexes
- `CosWorkEvent`: `variantId` (+ index)
- `CosConnection`: `accountType`, `externalAccountId`, `capabilities` (text[] default `{}`), `eligibilityNote`, `liveVerifiedAt`

**One index swap:** `CosConnection` unique `(orgId, provider)` → unique `(orgId, provider, externalAccountId)` + plain index `(orgId, provider)`.
`prisma db push` prints a data-loss *warning* for dropping a unique index; **no rows are lost** — existing rows have a null account id and remain valid. Locally this needed `--accept-data-loss` for that warning only.

Nothing is renamed or dropped. Marketing and partner tables are untouched. No column type changes.

## Compatibility
- Old code paths keep working: `CosMetricPoint`, `CosWorkspace.brandProfile`, single-body `publishWorkItem`, legacy (3-part) ciphertext.
- Existing connections: adopted by the first account discovered on the next reconnect; until then they behave as the workspace's primary account and have empty `capabilities` ⇒ **reconnect each account once** so publish/analytics capabilities are recorded.
- Existing delivered work has `deliveredAt = null` until the backfill runs ⇒ "deliverables this month" would under-count.

## Production rollout (do not run from a dev machine by habit — follow in order)
1. Rotate the provider secrets noted in `GROWTHOS_DECISIONS.md`; set `LEADOS_SECRET`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`; if production encrypted under `ADMIN_SESSION_SECRET`, also set `LEADOS_LEGACY_SECRET` to that old value.
2. Neon: create a branch / point-in-time restore marker. Record it.
3. `scripts/growthos-v2-ops.ts check-links` against production (read-only) — expect 0 orphans; fix any before step 7.
4. Deploy the code with the schema push as a separate, reviewed step: `npx prisma db push` (additive). Confirm the only warning is the `CosConnection` unique index.
5. `scripts/growthos-v2-ops.ts backfill` (dry-run) → review counts → `--apply`.
6. `scripts/growthos-v2-ops.ts rotate-keys` (dry-run) → `unreadable` must be 0 → `--apply` → remove `LEADOS_LEGACY_SECRET`.
7. Configure the scheduler for `/api/os/tick`; confirm the `/admin/os` banner turns neutral.
8. Reconnect each client account; verify one publish + one metric sync per provider; record in `GROWTHOS_VERIFICATION.md`.

## Rollback
The change is additive, so the previous build runs against the new schema unchanged. To roll back: redeploy the previous build; leave the new tables in place
(dropping them would destroy v2 data). The one thing the old build relies on is `CosConnection @@unique([orgId, provider])` in its Prisma client — it still works
as long as each org has at most one row per provider; if multi-account rows were created, roll forward instead. If the push itself misbehaves, restore the Neon branch from step 2.

## Staged plan for legacy relationships (not in this change)
1. (now) New tables constrained; legacy string ids left as they are; `check-links` reports orphans read-only.
2. (next) Reconcile any orphans, then add FKs `NOT VALID` and `VALIDATE CONSTRAINT` table by table (`CosWorkItem.parentId/contractId/findingId`, `CosFinding.auditRunId`, `Cos*.orgId`).
3. (later) Fold `CosMetricPoint` into `CosMetricSnapshot`; move `brandProfile` JSON into `CosBusinessProfile`.
