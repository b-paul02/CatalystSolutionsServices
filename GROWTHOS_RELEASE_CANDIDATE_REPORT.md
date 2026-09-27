# GrowthOS — release candidate report · 2026-09-21

Continues `GROWTHOS_FINAL_VERIFICATION.md`. Branch `growthos-v2`; **nothing committed, pushed, deployed, purchased, charged, published or emailed.** All execution was against the local disposable databases with stubbed provider boundaries. Words used: **verified locally** = executed here · **fixture-tested** = request/response shapes against stubs · **not verified** = never met the real service.

## 1. Results
| Check | Result | Log |
|---|---|---|
| Typecheck `npx tsc --noEmit` | **exit 0** | `growthos-release-evidence/typecheck.log` |
| Full regression `npx vitest run` (files run one at a time, disposable `growthos_test`) | **51 files, 578 tests passed, 0 failed, 0 skipped, exit 0** (was 49 / 555). No existing assertion was changed; the only edit to an older suite is the shape of a fixture object the harness now requires | `growthos-release-evidence/vitest-full.log` |
| Production build, isolated config (`scripts/local-build-check.mjs`: local DB, placeholder secrets, no provider keys, own output dir) | exit 0 | `growthos-release-evidence/build.log` |
| New suites | `release-gaps` 17 tests · `release-journeys` 6 tests | same log |
| Bundled dev endpoints | `/api/dev/llm` **is** in the build; answers 404 when `NODE_ENV=production` or without its flag (test). No other dev route exists under `app/api/dev`. | `completion-entry` |
| Local operator access | cookie signed with the local verification secret is refused when `NODE_ENV=production`, even if that secret and account were configured (new guard + test) | `release-gaps` |

## 2. Fixed and verified locally
| # | Item | What now happens | Evidence |
|---|---|---|---|
| A | **Studio brief → campaign** | The run page of a campaign brief has "Save as a campaign": name, engagement, goal, objective, audience, key message, offer, call to action and channels are pre-filled by an explicit heading parser and are all editable. It creates a **draft** `CosCampaign` with `ai.use` only — the client still cannot edit or activate it (`work.manage` stays staff-only); the Catalyst team is notified. Provenance (run id, edited fields, measures, sources) is stored in the campaign's first revision, the audit log and the run's `savedTo`. The run row is locked: a triple submit and a later repeat give **one** campaign. No model call, no ledger row. A link to the campaign is shown. | `release-gaps` A (3 tests); browser walk on the local server |
| B | **Five data-returning LeadOS actions** (`runSearch`, `previewReveal`, `doReveal`, `exportLeadsCsv`, `submitCampaignForReview`; also `previewCanvas`) | A refusal (signed out / wrong role / outside the purchased scope) comes back as a message the caller shows with `role="alert"`. It is never turned into an empty result; nothing is exported, revealed or submitted. Unexpected errors still reach the error boundary. | `release-gaps` B (4 tests: three denial kinds + permitted) |
| D | **Low-balance email** | In-app notice unchanged. Email goes to the workspace's own billing members only (owner/admin; never staff, never other roles), opt-out on the AI credits page, **one per episode**, 24 h cooldown, re-armed by recovery above the level or by a changed level, atomic claim so concurrent finishes send one. Credits merely *held* by a running job do not trigger it. Touches no balance. The scheduler also checks (credits can run low by expiring). | `release-gaps` D (2 tests, captured transport — no email left the process) |
| §2 | **AI timeout / late answer / restart** | See §3. | `release-gaps` §2 (3 tests) |
| §3 | **Client journeys from a real login** | The real password `login` action → `switchOrg` → Studio quote/run/charge/edit/save-as-variant → editorial (edit → QA → client approval → edit ⇒ that approval revoked, its schedule cancelled) → calendar (workspace-zone schedule, reschedule, cancel, scheduler publishes once via the test adapter) → two engagements / two workspaces isolated (edit, quote, save, export, wallet) → pause (staff-only) / resume → handover ⇒ read-only with history and export intact. | `release-journeys` (6 tests). Credits journey G (insufficient → purchase page → verified payment → credits once → run → history; staff work never debits the client) was already covered by `completion-credits` and re-ran green |
| §4 | **Two layout defects** | Content page scrolled sideways on a phone (grid track sized to its longest title); operator pages scrolled sideways (nav strip, wide tables). Both fixed and re-measured at 375 px. An empty "Saved:" label on the run page removed. | browser measurements |

## 3. AI timeout and crash handling — findings
The provider API is request/response: once our side stops waiting, **no late result can ever be delivered to us**, so there is nothing that could debit the client later. What *can* happen is that the provider finished (and billed Catalyst) anyway.
| State | What the system does |
|---|---|
| Definitive rejection before useful work (4xx) | attempt `failed`; client hold released; cost unknown ⇒ NULL |
| Confirmed failure (validator discard, provider 5xx after its bounded retries) | same; a search that ran is still recorded at its known price |
| **Our timeout — provider outcome unknown** | **changed this pass:** a metered call is **not re-sent** (it used to retry up to 4×, which could buy the same work four times); attempt marked `uncertain`; cost NULL; client hold released because the client received nothing; a new run needs a new quote from the person |
| Worker lost mid-call | swept to `uncertain` after 15 min; hold **kept**; never auto-retried or auto-released; operator closes it with a reason (audit event) |
| Stored output awaiting settlement | recovered by the sweep; charged once |
| Answer arrives after the sweep / after the operator released | the close is conditional on `running`: no output surfaces, no debit, invariant holds (tested with a delayed provider) |
Provider request ids are now stored on the attempt when the provider returns one (`CosAiAttempt.providerRequestId`). Wallet design unchanged.

## 4. Implemented, awaiting external verification (fixture-tested only)
- **Facebook Page video** (new): Resumable Upload → file handle → `POST graph-video /{page}/videos` → status poll, per the current Video API docs. Upload handle *and* accepted video id survive retries (no second upload, no second post); unanswered post ⇒ `uncertain`; processing error ⇒ stops for a person; missing app id ⇒ plain setup message. **Open question for the live check:** the upload step is documented with a *user* token and the connector holds the *Page* token.
- Everything already listed in `GROWTHOS_FINAL_VERIFICATION.md` §4 and §10: text/image model, search, private Blob storage, Stripe, email delivery, X, LinkedIn, Meta, YouTube, GA4, Search Console, and the scheduler trigger. Procedures: `GROWTHOS_EXTERNAL_CHECKS.md`.

## 5. Still missing
- A **screen-reader pass** (none performed; no accessibility conformance is claimed). Colour contrast not measured.
- Interactive **browser** walks of the variant editor's save, calendar scheduling and engagement actions (they were driven through their real server actions in `release-journeys`, and their pages were inspected at 375 px, but not clicked through in a browser). Browser sessions were dev-injected: the assistant does not type passwords into forms. The password login itself is covered at the action level. **Smallest owner check:** sign in once by hand on the local server.
- The error boundary was not force-triggered in a browser.
- Screenshots could not be saved to disk by the available tooling; visual evidence is what was observed and measured during the session.

## 6. Optional / deferred, with rationale
| Item | Rationale |
|---|---|
| AI **video generation** | No provider is named in any decision file, so none was chosen, integrated or bought. The honest path is complete and labelled: script → a person films/edits → finished file in Assets → variant → approval → publish. Record as an optional integration awaiting a vendor decision. |
| Instagram Stories, LinkedIn polls/articles | Not in the brief. |
| Page-level fetching for research | Snippet-level grounding is a stated limit; page fetching adds an SSRF surface and cost (decision 39). |
| Pause also holding already-approved scheduled posts | Today pause stops recurring cycle generation only; the kill switch is the stop for publishing. Behaviour verified and written down rather than changed — see decisions. |

## 7. Decisions needed from the owner
1. Accept or adjust the proposed rate card and packs; tax treatment; `AI_FX_INR_PER_USD`.
2. Which **one** production scheduler trigger (recommendation in `GROWTHOS_STAGING_SETUP.md` §4).
3. Buy a search plan or keep research off; confirm its terms allow AI use.
4. X developer tier (paid) or keep X manual.
5. Should pausing an engagement also hold its already-approved scheduled posts?
6. Video-generation vendor, or leave it out.
7. Confirm rotation of the keys exposed on 2026-09-18.
8. Permission to create local commits (none was given; see §9).

## 8. Verdicts
1. **Internal demonstration — READY.** Runs locally with the stand-in model; synthetic prices are labelled; every screen in the demo path was exercised on this build.
2. **Pilot using granted credits and manual publishing — NOT READY; three configuration steps away.** Needs a staging/production database with the schema applied by the reviewed procedure, a real text-model key exercised against the Studio prompts (check 1), private asset storage (check 4) and one scheduler trigger (check 6). No code is known to be missing for this shape of pilot. Research and direct publishing stay off.
3. **Pilot selling credits — NOT READY.** Everything in (2), plus owner-accepted prices that pass the floor check, tax decision, and the Stripe test-mode purchase/replay/refund/dispute round trip (check 5). Stripe has never been contacted.
4. **Production with automatic publishing — NOT READY.** Everything above, plus each publishing provider's app approval and live check (8–12), a reliable scheduler trigger, a screen-reader pass, and the open owner decisions. No external integration has ever been contacted from this codebase.

## 9. Code checkpoint (no commit was made — no instruction authorises one)
Reviewed: working diff (83 modified) and 99 untracked paths. Pattern scan for live keys, tokens, private keys and credentialed URLs: only placeholders and deliberately fake test URLs. `.env*` files with values are git-ignored. No production configuration changed (`vercel.json` untouched). Runtime dependency `@vercel/blob` is in `package.json` and the lockfile. `tsconfig.json` carries a Next-generated reformat only (no build-dir include). The throwaway local dev sessions minted for the browser pass were revoked.
Suggested grouping (all on `growthos-v2`):
1. **Safety rails** — `lib/dbGuard.ts`, `instrumentation.ts`, `tests/setup.ts`, `scripts/mark-disposable-db.mjs`, `scripts/local-db-push.mjs`, `scripts/local-build-check.mjs`, `scripts/seed-setup.ts`, `vitest*.ts`, `.gitignore`, `.env.example`, `lib/audit/adminAuth.ts`, `lib/audit/db.ts`, `lib/leados/crypto.ts`
2. **GrowthOS v2** (engagements, variants, publishing, outcomes) — `prisma/schema.prisma` + `prisma/changes/2026-09-growthos-v2.md`, `lib/os/{engagement,content,channels,publishing,adapters,metrics,outcomes,assets,storage,time,templates,notify,exporter,commercial,tick,connectors,work,entitlements,guard,catalog}.ts`, `app/app/(shell)/_os/{v2,accounts,actions}.ts`, the v2 pages, `app/api/os/**`, `app/api/stripe/**`, `components/os/{v2,panels}.tsx`, `scripts/growthos-v2-ops.ts`, `tests/os/v2-*`
3. **AI Studio + AI credits** — `prisma/changes/2026-09-growthos-ai-credits.md`, `lib/os/{credits,studio,creditPurchase,pricing,research,imagegen,ai}.ts`, `lib/audit/anthropic.ts`, `lib/leados/rbac.ts`, `app/app/(shell)/_os/studio.ts`, `app/app/(shell)/studio/**`, `settings/ai-credits/**`, `app/(site)/admin/os/**`, `components/os/{StudioForm,ActionForm}.tsx`, `app/api/dev/**`, `tests/os/completion-*`, `tests/os/entry-harness.ts`
4. **Denial handling** — `lib/leados/auth.ts`, the converted LeadOS `actions.ts` files and their callers, `denied/`, `error.tsx`
5. **Release pass** — `tests/os/release-*.test.ts`, the Facebook video adapter hunk, low-balance notice, brief→campaign, layout fixes
6. **Scheduler + tooling** — `.github/workflows/growthos-tick.yml`, `scripts/{local-scheduler,dev-verify,dev-sessions}.mjs`, `.claude/launch.json`, `next.config.mjs`, `package*.json`
7. **Documents and evidence** — `GROWTHOS_*.md|csv`, `CLAUDE.md`, `growthos-*-evidence/` (check `growthos-audit-evidence/` by eye before adding: it predates this pass)
Groups 2–5 share files (`schema.prisma`, `adapters.ts`, `studio.ts`); if a clean split is not worth the effort, commit 2–5 as one "GrowthOS v2 + AI Studio" commit and keep 1, 6, 7 separate. Do not push.

## 10. Smallest owner actions, in order
1. Say whether local commits may be made (and the grouping).
2. Create the staging database + Blob store; enter the staging variables (`GROWTHOS_STAGING_SETUP.md` §1–3). Apply the schema with §6.
3. Provide a capped text-model key → run check 1. Add the two scheduler secrets → check 6. Run check 4.  ⇒ *pilot with granted credits and manual publishing becomes possible.*
4. Decide prices/tax; create the real rate card and a pack; Stripe test keys + webhook → check 5.  ⇒ *pilot selling credits.*
5. Decide research / X tier / video vendor / pause policy. For each publishing provider wanted: obtain approval, run its check (8–12) on a test account, then enable it.
6. Arrange a screen-reader pass of the client screens; confirm key rotation; choose the production scheduler trigger.
