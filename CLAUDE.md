# Project rules

## Repo layout
- Marketing site + partner portal: `app/(site)`, `lib/partner`, `lib/audit`.
- LeadOS (app.catalystsolutionservices.com): `app/app`, `lib/leados`, admin at `app/(site)/admin/leados`. Blueprint: `docs/leados/blueprint.md`; build log: `docs/leados/PROGRESS.md`.
- CatalystGrowthOS (same app; LeadOS is its CRM / Lead Supply module): `lib/os`, `app/app/(shell)/_os/actions.ts`, OS pages under `app/app/(shell)`, admin at `app/(site)/admin/os`. Blueprint: `docs/os/blueprint.md`; build log: `docs/os/PROGRESS.md`.

## CatalystGrowthOS rules
- Read `docs/os/blueprint.md` before changing OS behaviour. Nothing under `lib/leados` / `Los*` is renamed; OS tables are `Cos*`-prefixed.
- Separation of duties is a hard rule: staff roles (`cgo_*`) never get `approvals.decide` / `spend.approve` / `contract.sign`; `client_review → approved` happens only through `decideApproval`. Tier-3 (money/release) needs a workspace owner. Never add a bypass.
- Approvals bind to `(version, contentHash)`; any material edit must create a new version and revoke live approvals. `CosWorkEvent` and `CosBaseline` are append/insert-only.
- Every external action (publish, send, launch) passes `gateAction` immediately before it runs and respects the kill switch.
- AI output always goes through the deterministic validators in `lib/os/ai.ts` and lands as a draft — never auto-executes, never reaches a client when validation fails. Never send lead personal data to the model.
- Out-of-contract work is a `change_request` — recommendations never silently create billable scope.
- Tests in `tests/os/`; both `tests/os/e2e-slice.test.ts` and `tests/leados/e2e-slice.test.ts` must stay green.

## LeadOS rules (from the approved blueprint)
- Read `docs/leados/blueprint.md` before changing product behavior.
- TypeScript strict; no `any` without written justification.
- All tenant-owned queries take orgId from `requireOrg()` (membership rows), never from client input.
- Never log raw personal data, auth tokens, or consent evidence.
- Schema changes via `npx prisma db push` — additive only; LeadOS tables are `Los*`-prefixed; NEVER touch marketing/partner tables. Dev runs against the PROD Neon DB.
- Every mutation: authorization check inside the action/route + validation + `logLosAudit` where specified.
- Public submissions: rate limit + bot protection + idempotency.
- Allocation, billing, and token operations are transactional, idempotent, and append-only (ledgers are never UPDATEd).
- All B2C contact paths call the purpose engine (`decideUse`) and suppression checks — there is deliberately no bulk-send path.
- Every feature ships with tests (`tests/leados/`); the §23 acceptance slice (`tests/leados/e2e-slice.test.ts`) must stay green.
- Run `npm run typecheck` and `npx vitest run` before declaring completion. Restart the dev server after `prisma db push` (stale client).
- Demo/test rows always set `demo: true` (wipe: `scripts/wipe-leados-demo.ts`).
- Stop and ask for a product decision when a request conflicts with privacy or tenant isolation.
