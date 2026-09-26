# GrowthOS completion — progress

**Resume rule:** read this, then `GROWTHOS_COMPLETION_HANDOFF.md` §8 (unfinished list). Never reset the working tree — **nothing is committed** (branch `growthos-v2`; the owner has not asked for a commit).
Local DBs only (`growthos_dev`, `growthos_test`, port 54329, both marked disposable). `.env` holds live values and Prisma auto-loads it — ALWAYS pass an explicit local `DATABASE_URL` to prisma CLI commands.
Last run 2026-09-21 (final verification): `npm run typecheck` clean · `npx vitest run` 49 files / 555 tests (files run sequentially) · production `next build` OK (`NEXT_DIST_DIR=.next-verify`, local DB).

## Done
- [x] Schema (additive, local only) + change note `prisma/changes/2026-09-growthos-ai-credits.md`
- [x] `lib/os/credits.ts`, `lib/os/studio.ts`, `lib/os/creditPurchase.ts`; payer fields on `metered()`; RBAC `ai.use`; `ent.aiTools`; studio-draft save path
- [x] Actions `app/app/(shell)/_os/studio.ts`; pages `/app/studio`, `/app/studio/[tool]`, `/app/studio/history/[id]`, `/app/settings/ai-credits`, `/app/denied`; `error.tsx`; nav + settings tab
- [x] Operator: `/admin/os/credits` + actions; `aiTools` on contract proposal; job failures on `/admin/os`
- [x] Reliability: `requireOrgPage` (25 pages), `orgOrDeny` (36 actions), tick lease + Studio/expiry sweeps, `.github/workflows/growthos-tick.yml`, `npm run tick:local`
- [x] Storage: `@vercel/blob` private + signed media links `/api/os/media/[versionId]`
- [x] Safety: disposable-DB marker (`lib/dbGuard.ts`, `scripts/mark-disposable-db.mjs`, `instrumentation.ts`, tests/seed/wipe guards)
- [x] Adapters: LinkedIn org / Facebook / Instagram analytics, X media upload (docs checked 2026-09-21)
- [x] Webhook: credit orders, refunds, disputes; invoice refunds; export includes AI history + credit ledger
- [x] Tests: `tests/os/entry-harness.ts`, `completion-credits` (25), `completion-entry` (8), `completion-adapters` (7)
- [x] Demo seed (tools, synthetic rate card/pack, credits); `scripts/dev-verify.mjs` + `/api/dev/llm` (dev only); `scripts/dev-sessions.mjs`
- [x] Browser walkthrough of the new surfaces (desktop + one mobile page); docs: PLAN, DECISIONS, REQUIREMENTS.csv, VERIFICATION, HANDOFF; CLAUDE.md rules

## Second pass — done
- [x] Pricing: `lib/os/pricing.ts` (margin model, activation guard, proposal), operator Profitability section, `GROWTHOS_AI_PRICING_PROPOSAL.md`, `tests/os/completion-pricing.test.ts`
- [x] Next#1 journey through entry points (`completion-journey`); found + fixed: no UI path to send a scope change for approval (`requestChangeApproval`)
- [x] Next#2 operator / proposeContract / invoice-refund tests (`completion-operator`)
- [x] Next#3 HTTP smoke of 21 pages, keyboard pass, skip link (screen reader NOT done)
- [x] Next#4 49 LeadOS actions converted (`requireOrgAction` / `requireOrgOrRedirect`); 5 data-returning ones left
- [x] Next#5 two-phase finish: crash after the provider answered is recovered and charged once
- [x] Next#6 (part) per-run source picker

## Third pass — done
- [x] LinkedIn multi-image, document (carousel) and video posts; media on X threads — adapters + channel formats + contract tests (docs checked 2026-09-21)
- [x] Real research mode: `lib/os/research.ts` (Brave Web Search API, off until `BRAVE_SEARCH_API_KEY`), explicit per-run option on 7 tools, citations validated deterministically, separately priced (`research` rate key), sources travel with the draft
- [x] Included AI credits: explicit number (+ optional expiry days) on the scope proposal, shown to the client before signing, granted once on signature (`contract:<id>`). Legacy tier placeholder `aiCredits` is never granted
- [x] Interactive browser walk: discovery profile save (v1→v2), claim approval, approval decision in the inbox, Results, Assets form

## Final verification — done
- [x] Production build, typecheck and full regression logged in `growthos-final-evidence/` (49 files / 555 tests)
- [x] Ten defects fixed with tests (atomic signing, revised-scope credit policy, upload identity across retries, citation support checks, untrusted retrieved text, source identity/time, citation integrity on save, separate search cost row, carousel wording, margin labelling)
- [x] All 14 templates instantiated through the real action; dev stand-in route proven dead in production
- [x] Browser: generation + wallet on the final build; file upload through the page's file input; automated a11y probe
- [x] `GROWTHOS_FINAL_VERIFICATION.md`, reconciled requirements CSV (adds Gap type + final note), handoff, pricing §4

## Release pass — done (details: `GROWTHOS_RELEASE_PROGRESS.md`)

## Next (if continuing)
1. Owner decisions: accept or adjust the pricing proposal (+ tax), scheduler trigger, search-provider plan and its AI-use terms, provider approvals, secret rotation.
2. Live verifications in HANDOFF §9: Stripe test-mode round trip, a real LLM key against the Studio prompts (incl. a researched run), Blob store, one publish + metric sync per provider.
3. A screen-reader pass with a human; saved screenshots.
4. Missing implementation still open: Facebook Page video, email low-balance notice, saving a Studio brief as a campaign record, video generation (needs a vendor). Instagram Stories is not in the brief.
5. Five data-returning LeadOS actions still throw on refusal (callers handle it).

## Commands
```
npm run typecheck ; npx vitest run
npx vitest run tests/os/completion-*.test.ts
npm run seed:growthos-demo ; node scripts/dev-verify.mjs ; node scripts/dev-sessions.mjs
```
