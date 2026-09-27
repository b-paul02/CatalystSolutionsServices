# Schema change 2026-09 — AI credits + client AI Studio (additive)

Applied so far: **local `growthos_dev` and `growthos_test` only.** Production has NOT been touched.
Follows `2026-09-growthos-v2.md`; apply that one first. `prisma db push` reported no warnings for this change.

## What changes
**New tables (12)** — all `Cos*`; every tenant-owned one has a cascading FK to `LosOrg`:
`CosCreditWallet`, `CosCreditGrant`, `CosCreditLedger` (append-only), `CosCreditReservation`, `CosCreditRateCard` (global),
`CosCreditQuote`, `CosCreditPack` (global), `CosCreditOrder`, `CosCreditMemberLimit`, `CosAiBillingAuth`, `CosAiOperation`, `CosAiAttempt`.

**New defaulted / nullable columns on existing tables** (no rewrite, no backfill needed):
- `CosAiUsage`: `payer` (default `catalyst_internal`), `billingPurpose` (default `internal_delivery`), `operationId`; index on `operationId`.
  Every historical row therefore reads as Catalyst-paid — **nothing recorded before the wallet existed can become a client debit.**
- `CosContract`: `aiTools` (default `[]`) — existing contracts grant no AI tools until an operator adds them.
- `CosPaymentEvent`: `providerPaymentId`, `creditOrderId`; index on `providerPaymentId`.
- `CosPublication`: `providerMedia` (nullable JSON text) — provider ids of media already uploaded for a publication, so a retry reuses the original upload. Added during final verification; nullable, no backfill.
- `CosCreditWallet`: `lowBalanceEmail` (default `true`), `lowArmed` (default `true`), `lowNotifiedAt` (nullable) — emailed low-balance notice state. Release pass; defaults apply to existing rows, no backfill.
- `CosAiAttempt`: `providerRequestId` (nullable) — the provider's id for the answered request, when it gives one. Release pass; no backfill.

Nothing is renamed, dropped or retyped. `Los*`, marketing and partner tables are untouched. `LosTokenLedger` (lead tokens) is not referenced.

## Compatibility
- Old code paths keep working; `metered()` gained optional fields only.
- A workspace has no wallet row until its first grant or reservation (created on demand).
- With no active rate card, client tools show "pricing not configured" and cannot run; staff internal use is unaffected.
- `lib/os/storage.ts`: the Vercel Blob adapter now stores with `access: "private"` and keeps the **pathname** as the ref. No production blob was ever written by the earlier adapter (its dependency was not installed), so there is nothing to migrate.

## Commands (local only)
```
DATABASE_URL="postgresql://growthos@localhost:54329/growthos_dev"  npx prisma db push --skip-generate
DATABASE_URL="postgresql://growthos@localhost:54329/growthos_test" npx prisma db push --skip-generate
npx prisma generate
node scripts/mark-disposable-db.mjs growthos_dev growthos_test     # once per throwaway database
```
`.env` on this machine holds live values and Prisma auto-loads it: **always pass an explicit local `DATABASE_URL`.**

## Production rollout (not performed)
1. Complete the v2 rollout note first. Take a Neon branch / restore point and record it.
2. Follow `GROWTHOS_STAGING_SETUP.md` §6 (reviewed SQL diff first, schema BEFORE code, staging before production). Expect: 12 tables created, 11 columns added, 2 indexes. No data-loss warning — stop if one appears.
3. Do NOT run `mark-disposable-db.mjs` against production, ever.
4. `/admin/os/credits`: create a real (non-synthetic) rate card → review → activate; publish real packs; add Stripe webhook events (handoff doc). Until then purchases stay closed by design.
5. Add `aiTools` to contracts through a scope change the client signs (tools are scope the client can see).

## Rollback
Code rollback is safe with the schema left in place (all additions are unused by older code). To remove the schema: drop the 12 tables and the 11 columns — only when no real credit has been granted; otherwise keep the ledger (it is a financial record).
