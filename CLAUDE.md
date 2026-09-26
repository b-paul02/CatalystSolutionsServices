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
- AI output always goes through the deterministic validators in `lib/os/ai.ts` and lands as a draft — never auto-executes, never reaches a client when validation fails. Never send lead personal data to the model — EXCEPT inside a client's own workflow (owner decision 2026-09-19): an AI step may receive the lead data that workspace's workflow passes to it. It is still never logged (step logs are redacted).
- Out-of-contract work is a `change_request` — recommendations never silently create billable scope.
- Workflows (`lib/os/automation`): only the ACTIVATED definition runs (hash match) — any logic edit drops it to draft. Staff (`cgo_*`) can build but never activate. Clients never run code on our servers: no code/shell/SQL blocks, ever, and no client-installable nodes. Every step that contacts a lead goes through `sendOutreachMessage` (consent, suppression, caps) — this was NOT relaxed. HTTP steps go through `safeUrl` (no internal addresses, no redirects). New integration = one entry in `catalog.ts` + one runner in `blocks.ts`.
- Tests in `tests/os/`; both `tests/os/e2e-slice.test.ts` and `tests/leados/e2e-slice.test.ts` must stay green.

## GrowthOS v2 rules (engagements, content variants, publishing, outcomes)
- Read `GROWTHOS_PROGRESS.md` and `GROWTHOS_DECISIONS.md` first; schema notes and the production rollout are in `prisma/changes/2026-09-growthos-v2.md`.
- An engagement is "accepted" only by the client's signature. Payment status is derived from commercial records, never typed.
- Approvals are per channel variant (`CosApproval.subject = "variant"`): a copy / media / CTA / destination edit revokes THAT variant's approval and cancels its schedule; master or brief changes only flag variants.
- Every publish goes through `lib/os/publishing.ts` (atomic claim → publish-time revalidation → adapter → attempt log). Retry only `retryable` failures; an `uncertain` outcome is never retried — a person reconciles it. Never report a success the provider did not give; the `test` adapter is dev-only and always labelled.
- A script is not a video: video formats need a finished file from Assets. Never label generated text as a produced asset.
- Metrics: `daily` rows add up, `lifetime` rows take the latest; missing is absent (never 0); money is grouped per currency; demo rows stay out of real clients' reports; reach is never summed.
- Attribution is only what a tagged link, the person, or nothing tells us (`known | self_reported | unknown`). Never infer causation in copy or reports; AI narratives may only contain numbers present in the supplied facts.
- No secret fallbacks. `LEADOS_SECRET` and `ADMIN_SESSION_SECRET` are required; ciphertext is versioned (`k2.`).
- Read-only (handed-over) workspaces: everything visible and exportable, nothing writable — use `assertWritable`.
- Tests: `tests/os/v2-*.test.ts(x)` must stay green with both e2e slices.

## AI Studio + AI credits rules (2026-09 completion)
- Read `GROWTHOS_COMPLETION_HANDOFF.md` and `GROWTHOS_COMPLETION_DECISIONS.md` first; schema note: `prisma/changes/2026-09-growthos-ai-credits.md`.
- Four controls stay independent: service scope (`CosContract.services/modules`), tool entitlement (`CosContract.aiTools`), credit balance (wallet), action permission (RBAC `ai.use` / `org.billing`). Never derive one from another; credits never unlock tools, services, approvals or publishing.
- AI credits are NOT lead tokens. `CosCreditLedger` is append-only; corrections are compensating entries. Every balance mutation runs under `lockWallet` (lib/os/credits.ts) and must keep `walletInvariant` true.
- Client AI goes quote -> reserve -> queue -> provider (no transaction open) -> persist + settle, or release. The price, payer and org never come from the browser. Settlement never exceeds the quote. An `uncertain` run is never auto-retried or auto-released.
- Payer is explicit (`client_wallet` | `catalyst_internal`) and comes from purpose + a client-granted `CosAiBillingAuth`, never from role alone. Catalyst production AI (`metered()` default) must never debit a client. Provider money cost stays NULL when unknown.
- Credits are granted only from a verified, order-matched provider event (or a reasoned operator grant). Refunds/disputes go through the target-based `reconcileOrder`. No auto-recharge. Synthetic rate cards/packs are dev-only.
- Research: web research is real retrieval with validated `[n]` citations (lib/os/research.ts) or it is not offered; never fall back silently to an un-researched draft, never send anything but the typed topic to the search provider.
- Publishing retries must reuse uploads (`AdapterError.mediaRefs` → `CosPublication.providerMedia`); never re-upload on a retryable failure. Signing stays ONE transaction (claim + grant).
- A metered (AI Studio) provider call that TIMES OUT is never re-sent: the attempt is `uncertain`, cost NULL, the client hold released. Low-balance email goes only to the workspace's own billing members, once per episode (`lowBalanceNotice`). A Studio brief becomes a campaign only as a DRAFT via `saveBriefAsCampaign` (one per run) — never give clients `work.manage`.
- Included credits come only from `includedAiCredits` on a signed contract (`contract:<id>`, once). Never turn the legacy `allowances.aiCredits` placeholder into credits.
- Pricing: a real rate card must pass the margin check in `lib/os/pricing.ts` before activation (never bypass it; unknown cost = not allowed). `PROPOSED_*` are proposals, never auto-activated; keep `tests/os/completion-pricing.test.ts` green when editing them.
- Pages use `requireOrgPage` (redirects); actions return a message on refusal; `error.tsx` is for unexpected failures only.
- Assets are private in every storage adapter; providers get only `mediaLink()` signed, expiring links.
- Schema to local DBs: `node scripts/local-db-push.mjs`; production-shaped build check: `node scripts/local-build-check.mjs`. Hosted rollout: `GROWTHOS_STAGING_SETUP.md` §6 (reviewed SQL diff, never `--accept-data-loss`, schema before code).
- Dev/test/seed/wipe need a LOCAL database that also carries the disposable marker (`scripts/mark-disposable-db.mjs`). `.env` holds live values and Prisma auto-loads it: always pass an explicit local `DATABASE_URL` to prisma CLI commands.
- Tests: `tests/os/release-*.test.ts` and `tests/os/completion-*.test.ts` drive real entry points through `tests/os/entry-harness.ts`; keep them green with the v2 suites and both e2e slices.

## LeadOS rules (from the approved blueprint)
- Read `docs/leados/blueprint.md` before changing product behavior.
- TypeScript strict; no `any` without written justification.
- All tenant-owned queries take orgId from `requireOrg()` (membership rows), never from client input.
- Never log raw personal data, auth tokens, or consent evidence.
- Schema changes via `npx prisma db push` — additive only; LeadOS tables are `Los*`-prefixed; NEVER touch marketing/partner tables. Dev and tests run against a LOCAL disposable Postgres only (`lib/dbGuard.ts` fails closed; see `GROWTHOS_EXTERNAL_SETUP.md`) — never push, seed, wipe or test against production.
- Every mutation: authorization check inside the action/route + validation + `logLosAudit` where specified.
- Public submissions: rate limit + bot protection + idempotency.
- Allocation, billing, and token operations are transactional, idempotent, and append-only (ledgers are never UPDATEd).
- All B2C contact paths call the purpose engine (`decideUse`) and suppression checks — there is deliberately no bulk-send path.
- Every feature ships with tests (`tests/leados/`); the §23 acceptance slice (`tests/leados/e2e-slice.test.ts`) must stay green.
- Run `npm run typecheck` and `npx vitest run` before declaring completion. Restart the dev server after `prisma db push` (stale client).
- Demo/test rows always set `demo: true` (wipe: `scripts/wipe-leados-demo.ts`).
- Stop and ask for a product decision when a request conflicts with privacy or tenant isolation.
