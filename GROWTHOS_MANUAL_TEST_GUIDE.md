# CatalystGrowthOS — Customer Journey and Feature Testing Guide

Version 1.0 · prepared 2026-09-22 against branch `growthos-v2` (working tree, uncommitted; release candidate report of 2026-09-21). Author: QA lead / product acceptance. Status of this pack: **documented, not executed** — every test starts at *Not run*.

This guide is for one person to follow end to end. It tells you where to go, which account to use, what to type, what to click, what must happen, and how to recognise a failure. The companion files are listed in `GROWTHOS_TESTING_QUICK_START.md`.

---

## 1. How this guide was produced

Discovery read the code, not the marketing copy:

- Every `page.tsx`, `layout.tsx`, `route.ts`, `error.tsx` and `actions.ts` under `app/` — visible headings, form labels, button labels, dialogs, empty states, guards.
- Every exported server action (client shell, auth, onboarding, settings, LeadOS, workflows, admin, partner) with its permission check and refusal behaviour; `lib/leados/rbac.ts` and `lib/leados/auth.ts` for the role/permission matrix, sessions, invitations, MFA, workspace switching.
- `prisma/schema.prisma` and `lib/os/*` for every `Cos*` model, status vocabulary and transition table (engagement, contract, work item, approval, variant, publication, cycle, commercial record, asset).
- `lib/os/catalog.ts` and `lib/os/templates.ts` for the 14 service templates; `lib/os/studio.ts` for the 17 AI tools; `lib/os/channels.ts` + `lib/os/adapters.ts` for the publishing format matrix; `lib/os/credits.ts`, `creditPurchase.ts`, `pricing.ts` for the wallet; `lib/os/tick.ts` and the automation engine for background jobs; `lib/partner/*` for the partner track.
- All 51 test files and what each actually drives (library vs real entry points).
- The release documents named in the brief, plus `GROWTHOS_COMPLETION_DECISIONS.md`, `GROWTHOS_DECISIONS.md`, `GROWTHOS_FINAL_VERIFICATION.md`, `GROWTHOS_EXTERNAL_SETUP.md`, `docs/os/blueprint.md`, `docs/leados/RUNBOOK.md`.

Where a document and the code disagree, the code is recorded as "as built" and the difference is listed in `GROWTHOS_TESTING_GAPS_AND_DECISIONS.md` §5. No application behaviour was changed to write this pack. No test in it is described as passed.

## 2. Business rules this pack tests against

| Rule | How the pack checks it |
|---|---|
| Catalyst sells premium services and managed engagements; GrowthOS supports delivery and collaboration | journeys C, D, E (scope → onboarding → templates → QA → client approval → delivery) |
| Clients use only AI tools included in their signed scope | SCOPE-06, AI-04, SET-11 |
| AI usage consumes included or purchased credits | AI-01…17, CRD-01 |
| Service scope, tool entitlement, credit balance and approve/publish permission are four separate controls | SCOPE-06, AIX-15, CRD-05, SCOPE-04 |
| Credit purchases never expand scope or bypass permissions | SCOPE-06 step 3, CRD-06 |
| Catalyst's internal AI never silently debits a client | CONT-09, ENG-14, AST-07, AIX-12 |
| Staff-assisted client-paid AI needs the client's authorisation | AIX-12 |
| AI output starts as a draft | every AI-xx save step, AIX-15, CONT-04 |
| Client approval applies to the correct content version | CONT-05, ENG-07, PUB-06 |
| Integrations disclose unavailable/unsupported capabilities | PUB-01, PUB-07, PUB-25, PUB-26 |
| Missing analytics is never shown as zero | ANL-01, ANL-02, ANL-06, AI-17 |
| Unsettled policy is marked "Owner decision required" | SET-10, SET-11, SET-03, gaps §1 |

## 3. Coverage inventory (summary)

The full inventory is `GROWTHOS_TEST_COVERAGE_MATRIX.csv` (rows of kind `feature`: Feature → roles → route/entry point → prerequisites → actions → states → status → test IDs → gap; rows of kind `requirement`: the 64 `C-*` requirements from `GROWTHOS_COMPLETION_REQUIREMENTS.csv` → test IDs).

| Implementation status (88 features) | Count |
|---|---|
| Implemented and available locally | 60 |
| Requires configuration | 10 |
| Requires external verification | 14 |
| Partially implemented | 3 |
| Optional / explicitly deferred | 1 |
| Missing but required by the agreed scope | 0 features as a whole; item-level gaps are listed in the gaps file (G-PUB-1, G-PTR-1, G-CAL-1, G-ENG-1, G-OFF-1, G-NOTF-1, G-ENTRY-1) |
| Not applicable | 0 (nothing intended was labelled N/A for being unbuilt) |

| Test cases | Count |
|---|---|
| Total | 229 (951 numbered actions) |
| P0 / P1 / P2 | 106 / 97 / 26 |
| Local (dev-verify) / Local + configuration / Staging / Production read-only | 190 / 12 / 26 / 1 |
| Browser-driven (incl. mixed) / integration / harness-API / background job / manual accessibility / technical | 186 / 21 / 11 / 4 / 3 / 4 |
| By journey | Preparation 5 · A Discovery 9 · B Access 15 · C Scope 8 · D Onboarding 8 · E Delivery 17 · F Content + scheduling 14 · G AI Studio 32 · H Credits 11 · I Assets 7 · J Publishing 27 · K Analytics 9 · L CRM + workflows 12 · M Partner 9 · N Notifications 3 · O Settings/offboarding 13 · Operator 10 · Background jobs 6 · Cross-cutting 14 |
| By role (a test may use several) | client owner 113 · staff specialist 42 · staff lead 40 · operator 38 · tester/technical 21 · visitor 16 · restricted member 9 · second-workspace owner 8 · partner 5 |
| Requirements with at least one manual test | 64 of 64 |

How completeness was checked: the route inventory (every URL in `app/`) and the action inventory (every exported action) were cross-referenced against test `route/action` fields; the 14 service templates against ENG-03; the 17 tools against AI-01…17; the 14 publishing formats against PUB-09…25; the nine tick sweeps against SETUP-04, ENG-08/09, ANL-06, AIX-07, CRD-03/04, JOB-03, WF-02. Items with no UI (dead actions) and the never-emitted `connection_failed` notification are recorded as unmapped in the gaps file.

**Documented coverage is not executed coverage.** A test ID against a row means a procedure exists, nothing more.

## 4. Preparing to test (beginner-friendly)

### 4.1 Start the application

Prerequisites on this machine: Node 22, the local Postgres 18 cluster at `%LOCALAPPDATA%\growthos-devdb` (created per `GROWTHOS_EXTERNAL_SETUP.md`), `.env.development.local` and `.env.test.local` present. Then, in PowerShell at the repo root:

```powershell
pg_ctl -D "$env:LOCALAPPDATA\growthos-devdb" -o "-p 54329" start
node scripts/local-db-push.mjs
node scripts/mark-disposable-db.mjs growthos_dev growthos_test
npm run seed:growthos-demo
npm run seed:price-book
node scripts/dev-verify.mjs
```

Second window (keep it open — nothing scheduled runs without it):

```powershell
$env:CRON_SECRET='local-dev-cron-secret'; $env:LOCAL_TICK_URL='http://localhost:3100/api/os/tick'; npm run tick:local
```

**Base URL:** the dev-verify script prints it; it is `http://localhost:3100` (override with `PORT`). The client app lives under `/app`, the operator portal under `/admin`, the partner portal under `/partner`, the marketing site at `/`. `npm run dev` on port 3000 is the alternative when you have real `LLM_*` keys in `.env.development.local` (no stand-in model there).

### 4.2 Which environment for which test

See `GROWTHOS_TEST_ACCOUNTS_AND_DATA.md` §1. Short form: everything mechanical locally; the twelve external checks on staging; production read-only.

### 4.3 Confirm the database is safe

`GROWTHOS_TEST_ACCOUNTS_AND_DATA.md` §2 — two proofs (local host + in-database marker), verified by SETUP-02 without ever displaying the connection string.

### 4.4 Accounts

`GROWTHOS_TEST_ACCOUNTS_AND_DATA.md` §3 and §7. Seeded: owner, lead, specialist (password printed by the seed). Created during the run through supported procedures: restricted member (invite), sales rep (invite), freelancer (operator add staff), workspace C owner (operator provisioning), partners (application → admin approval), operator (dev-verify env entry).

### 4.5 Reset

SETUP-05: `scripts/wipe-leados-demo.ts` then re-seed. Only demo-flagged rows are removed.

### 4.6 Evidence

`growthos-manual-evidence/<date>/` with `screens/`, `logs/`, the filled tracker and `defects.md` (accounts file §6). Redact tokens and keys.

## 5. End-to-end customer lifecycle scenarios

Each scenario is an ordered list of test IDs; the tests carry the exact steps. Run them in this order so that setup never goes missing halfway.

### Scenario S1 — From enquiry to signed scope (visitor → operator → owner)
ENTRY-06 (public form creates a lead, not a workspace) → ENTRY-04 (audit submission creates a report, not a workspace) → OPS-02 (operator provisions workspace C and invites the owner) → AUTH-05 pattern via the invite link → SCOPE-01 (proposal with services, tools, 40 included credits) → SCOPE-02 (client sees scope and commercial terms; signs; entitlements and credits activate once; checklist seeded) → SCOPE-03 (decline / repeat submission) → SCOPE-05 (grant exactly once, historical contracts).

### Scenario S2 — Onboarding and readiness
ONB-01 (profile) → ONB-02 (objectives) → ONB-03 (claims, client-only approval) → ONB-04 (sources) → ONB-05 (brand) → ONB-06 (access requests, provider-verified access, blocked dependent work) → ONB-07 (go active with a note) → ENG-03 (delivery plan from a template).

### Scenario S3 — Delivery with QA and client approval
ENG-04 → ENG-06 → ENG-07 → ENG-05 → ENG-11 → ENG-08 (recurring cycles) → ENG-09 (renewal) → SCOPE-07 (out-of-scope → change request → owner approval charged once) → ENG-10 (second engagement).

### Scenario S4 — Content from AI draft to published post
AI-06 (LinkedIn post: quote → run → save as draft variant) → CONT-04 (QA → client review → approval) → CAL-01 (schedule in workspace time; scheduler publishes once via the test adapter) → CONT-05 (edit revokes that approval and cancels its schedule) → PUB-04 (uncertain outcome reconciled by a person) → PUB-07 (manual publication with link) → ANL-01/ANL-02 (results with n/a never zero) → AI-17 (performance summary grounded in facts).

### Scenario S5 — Credits and payments
CRD-01 → OPS-05 → CRD-02 → AIX-01 (insufficient) → AIX-04 (failure not charged) → AIX-07 (uncertain held → operator closes) → AIX-12 (who pays) → CRD-04 (low balance) → CRD-05 (purchases closed until real config) → staging: CRD-06 → CRD-07 → CRD-08 → CRD-11 (tokens untouched).

### Scenario S6 — Offboarding
SET-10 (pause: document what continues — owner decision) → SET-13 (contract end) → SET-11 (handover: read-only, history and export intact, tools gone, credits remain) → SET-12 (handover with another engagement open) → SET-07 (export).

### Scenario S7 — Partner track
ENTRY-08 → PTR-01 → PTR-02 → PTR-03 → PTR-04 → PTR-05 → PTR-06 → PTR-07 (won deal → workspace) → PTR-08 → PTR-09.

## 6. Test runs (ordered, with time estimates)

Estimates assume the environment from §4 is already up and one tester. Times are for a first pass with evidence capture; add 30% if you also log defects as you go.

### Run 1 — Quick smoke before a demonstration (≈ 45 min)
SETUP-01, SETUP-04, AUTH-01, AUTH-10, SCOPE-06, AI-06 (steps 1–8), CRD-01, CONT-04 (steps 1–5), CAL-01, ANL-01, OPS-01, XQ-05 (Brightside only).
Pass criterion: no P0 failure. Any failure here blocks the demo.

### Run 2 — Complete client acceptance journey (≈ 1.5 days)
S1 → S2 → S3 → S4 → S5 (local part) → S6, plus AUTH-05, AUTH-11, AUTH-12, AUTH-13, CONT-01…CONT-08, CAL-02, CAL-03, AST-01…AST-03, AST-06, PUB-01, PUB-03…PUB-08, ANL-03…ANL-05, ANL-08, ANL-09, NOTF-01, NOTF-02, SET-01, SET-03, SET-05, SET-06, SET-07, XQ-07, XQ-11.

### Run 3 — Staff and operator journey (≈ 1 day)
AUTH-14, OPS-01…OPS-10, ENG-01…ENG-17, CONT-06, CONT-09, ENG-13, ENG-14, ENG-15, ENG-16, ENG-17, AIX-12, CRD-02, CRD-03, CRD-09, OPS-06, SET-08, SET-09, SET-13, JOB-01, JOB-02, JOB-03, LEAD-06, LEAD-07 (needs OPS-08), OPS-04.

### Run 4 — Partner journey (≈ half a day)
`npm run seed:price-book` then S7 in full (ENTRY-08, PTR-01…PTR-09), plus PTR-07 and the isolation check PTR-08.

### Run 5 — AI-credit and payment verification (local ≈ 3 h; staging ≈ half a day)
Local: every AI-xx (17 tools; AI-04 and AI-16 exercise the entitlement/availability negatives), AIX-01…AIX-10, AIX-13…AIX-15, CRD-01…CRD-05, CRD-09, CRD-11, OPS-05, OPS-06.
Staging (after checks 1 and 5): AIX-06 provider step, AIX-11, CRD-06, CRD-07, CRD-08, CRD-10, AST-07, AI-16 generation step, NOTF-03.

### Run 6 — Platform-by-platform integration verification (staging; ≈ 1–2 h per platform after approvals)
Order per `GROWTHOS_EXTERNAL_CHECKS.md`: AST-04/AST-05 (Blob, check 4) → AI usefulness (check 1) → JOB-04 (check 6) → CRD-06..08 (check 5) → NOTF-03 (check 7) → PUB-02/PUB-09 (WordPress) → PUB-10…12 (X) → PUB-13…17 (LinkedIn) → PUB-18…22 (Meta) → PUB-23…24 (YouTube) → ANL-07 (GA4/GSC) → PUB-26 (expired credentials) → SET-04.
Stop at the first unexpected result on a platform and record it; never retry an uncertain publication.

### Run 7 — Full regression before release (≈ 4–5 days local + the staging runs)
All 229 cases in ID order within each journey: SETUP → ENTRY → AUTH → SCOPE → ONB → ENG → CONT → CAL → AI → AIX → CRD → AST → PUB → ANL → LEAD → WF → PTR → NOTF → SET → OPS → JOB → XQ. Re-run SETUP-03 first and record the automated numbers for the build under test.

### Dependency order (why the order above)
SETUP → AUTH-05/OPS-02 (accounts) → SCOPE (entitlements) → ONB/ENG (work exists) → CONT (variants exist) → CAL/PUB (approved variants) → ANL (published items) → SET-10/11 last (they change access mode). CRD tests that reduce balance come after the AI tool tests. PTR-04 needs the price book. LEAD-06/07 need OPS-08 and CRD-11.

## 7. Recognising a failure and its blast radius

| Symptom | Verdict |
|---|---|
| Expected message/screen not shown; a 500 page, blank panel or stack trace instead | **Fail** (P0 if on a P0 test) |
| A refusal that returns empty data or a silent no-op where the test expects a message | **Fail** |
| Any cross-tenant read (AUTH-11, XQ-11), any charge without output, any second post/grant/campaign from a repeat | **Fail — blocks the whole pilot** |
| A staff role able to sign, approve, decide spend, or activate a workflow | **Fail — blocks the whole pilot** |
| Publication `uncertain` | not a failure by itself; the failure is if it auto-retries or reports success without provider evidence |
| Feature needs a key/account you do not have | **Blocked** (name the dependency from the test's External column) |
| Behaviour differs from the brief but matches "as built" and is listed as an owner decision | **Pass with note** referencing the gaps file item |

Blocks only one capability: a single publishing format, one AI tool's prompt quality, one analytics adapter, contrast on one page. Blocks the pilot shape "granted credits + manual publishing": anything in AUTH, SCOPE, CRD (accounting), AIX-03/04/07/12, CONT-04/05, SET-11, XQ-11, JOB-01. Blocks "selling credits": CRD-05…CRD-08. Blocks "automatic publishing": PUB-03…PUB-08 plus the platform's live format.

## 8. Defect report template

```
Defect ID: DEF-<area>-<n>
Test ID: 
Account / role: 
Environment (local / local+config / staging / production-readonly) and build (git SHA or date): 
Steps to reproduce (numbered, exact labels/values): 
Expected result: 
Actual result (exact message text): 
Severity: P0 blocks pilot / P1 blocks a capability / P2 cosmetic-or-workaround
Reproducibility: always / intermittent (n of m) / once
Evidence: screens/…, logs/… (redacted)
Affected release: growthos-v2 @ <date>
Owner decision involved? (link to GROWTHOS_TESTING_GAPS_AND_DECISIONS.md item) 
```

## 9. Notes on AI output assessment

For every AI tool test, judge usefulness against explicit criteria rather than wording: (1) the output addresses the typed topic and audience; (2) it respects "must include / avoid" notes and the brand "Never" list; (3) no banned claims, placeholders or invented figures (figures not present in approved claims/sources/notes must appear as "Check before using" flags); (4) formatting matches the tool (parts for threads, dated items for calendars, headings for briefs, subject+body for emails, meta fields for SEO); (5) length within the chosen limit; (6) for research runs, every `[n]` maps to a listed source with a retrieval date and the standing "not a fact-check" notice is present. Two runs with different wording both pass if each meets the criteria. Locally the stand-in model returns fixed `[TEST DRAFT]` text, so only mechanics are provable; quality needs staging with a real key.

## 10. Test cases

Every case below has the same fields. "Actions" are numbered; each line is *what you do → what must happen*. The Result, Evidence and Defect fields are filled in the tracker CSV. Environments: **Local** = dev-verify at http://localhost:3100; **Local + configuration** = a real key added locally; **Staging** = the separate deployment; **Production** = read-only checks only.

### Preparation

#### SETUP-01 — Environment

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Manual/technical · Local (dev-verify, http://localhost:3100) |
| Account and role | Tester (no app account needed) |
| Preconditions and test data | Postgres 18 cluster exists at %LOCALAPPDATA%\growthos-devdb (see GROWTHOS_EXTERNAL_SETUP.md). Node 22. `.env.development.local` and `.env.test.local` present. |
| Start route / navigation | PowerShell in the repo root |
| Final expected state | Server answers http://localhost:3100/app/login with the Sign in page. |
| Observable evidence | Terminal output of each command; screenshot of the login page. |
| Negative / alternate path | SETUP-02 |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-SAFE-01 · n/a · scripts/* · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Run `pg_ctl -D "$env:LOCALAPPDATA\growthos-devdb" -o "-p 54329" start` => server starts (or reports already running)
2. Run `node scripts/local-db-push.mjs` => both local DBs get the schema; ends with `prisma generate`; no data-loss warning
3. Run `node scripts/mark-disposable-db.mjs growthos_dev growthos_test` => prints that each database is marked (idempotent)
4. Run `npm run seed:growthos-demo` => seed test passes; last lines print the three demo accounts and the synthetic password
5. Run `node scripts/dev-verify.mjs` => Next dev server on http://localhost:3100 with the stand-in model; no `instrumentation` exit

> Tester note: If the server exits at start with a disposable-marker error, step 3 was skipped or ran against the wrong DB name. Never run mark-disposable against a hosted DB. `npm run dev` (port 3000) uses .env.development.local without the stand-in model; use it only when you have real LLM_* keys.

#### SETUP-02 — Environment safety

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Manual/technical · Local (dev-verify, http://localhost:3100) |
| Account and role | Tester |
| Preconditions and test data | SETUP-01 done. |
| Start route / navigation | PowerShell |
| Final expected state | You have confirmed tests and dev server cannot reach a non-local database. |
| Observable evidence | Vitest output lines (no connection strings). |
| Negative / alternate path | — |
| Cleanup | Restore `.env.test.local`. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-SAFE-01, C-SAFE-02 · n/a · lib/dbGuard.ts · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Run `$env:DATABASE_URL='postgresql://growthos@localhost:54329/growthos_dev'; node -e "require('./lib/dbGuard')"` is not needed; instead run `npx vitest run tests/os/v2-rules.test.ts` => passes (contains the fail-closed guard tests)
2. Temporarily rename `.env.test.local` and run `npx vitest run tests/leados/tenancy.test.ts` => the run reports the blocked/unreachable database warning and DB tests fail to connect (proves fail-closed); restore the file
3. Open `.env.development.local` in an editor and confirm `DATABASE_URL` host is localhost:54329 and the name is growthos_dev — do not paste the value anywhere

> Tester note: Never edit `.env` (it holds live values).

#### SETUP-03 — Automated suites baseline

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Manual/technical · Local (dev-verify, http://localhost:3100) |
| Account and role | Tester |
| Preconditions and test data | SETUP-01 done; dev server may stay running. |
| Start route / navigation | PowerShell |
| Final expected state | Baseline recorded in the tracker with the date. |
| Observable evidence | Console tail with the summary line. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-VER-01, C-TEST-01 · n/a · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Run `npm run typecheck` => exit 0
2. Run `npx vitest run` => all files pass (expected 51 files / 578 tests as of 2026-09-21; record the actual numbers)

> Tester note: A pass here is NOT execution of this manual pack; it only proves the build you are testing matches the release candidate.

#### SETUP-04 — Local scheduler

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Background job · Local (dev-verify, http://localhost:3100) |
| Account and role | Tester |
| Preconditions and test data | dev-verify running (it sets CRON_SECRET=local-dev-cron-secret for its own server). |
| Start route / navigation | Second PowerShell window |
| Final expected state | Scheduler loop running for the whole session. |
| Observable evidence | Terminal lines showing status 200. |
| Negative / alternate path | JOB-01 |
| Cleanup | Ctrl+C when finished. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-REL-04 · /api/os/tick · runTick · CosHeartbeat os.tick |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Run `$env:CRON_SECRET='local-dev-cron-secret'; $env:LOCAL_TICK_URL='http://localhost:3100/api/os/tick'; npm run tick:local` => prints a tick every 60 s with status 200 and a JSON summary
2. In a browser open http://localhost:3100/api/os/tick without a header => 401

> Tester note: Without this window nothing scheduled ever fires locally (publishing, cycles, reminders, expiry, uncertain sweeps). `.env.development.local` does not carry CRON_SECRET, hence the explicit env var.

#### SETUP-05 — Reset test data

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Manual/technical · Local (dev-verify, http://localhost:3100) |
| Account and role | Tester |
| Preconditions and test data | Local DB marked disposable. |
| Start route / navigation | PowerShell |
| Final expected state | Data back to the documented seed state (see GROWTHOS_TEST_ACCOUNTS_AND_DATA.md §3). |
| Observable evidence | Wipe counts + seed output. |
| Negative / alternate path | — |
| Cleanup | n/a |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-SAFE-01 · n/a · scripts/wipe-leados-demo.ts · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Run `npx tsx scripts/wipe-leados-demo.ts` (or `node --experimental-strip-types scripts/wipe-leados-demo.ts`) => per-table counts printed; only `demo: true` rows removed
2. Run `npm run seed:growthos-demo` => fresh Brightside Dental (demo) and Northwind Robotics (demo) workspaces

> Tester note: The seed deletes earlier demo orgs whose name ends in `(demo)` first, so re-seeding without wiping is also safe. Workspaces you create by hand (workspace C, partner rows) are NOT demo-flagged unless you tick the demo box; wipe them by re-running the wipe only if you flagged them demo.


### A. Discovery

#### ENTRY-01 — Marketing site navigation

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Visitor (signed out) |
| Preconditions and test data | Dev server running. |
| Start route / navigation | http://localhost:3100/ |
| Final expected state | All routable pages load; two sitemap entries 404. |
| Observable evidence | Screenshots of the 404s. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · / /services /industries /use-cases /proof /about /growth-audit /privacy · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Load the home page => H1 'Build Your Digital Presence…' and header links Services, Industries, Use Cases, Demo Sites, About, Free Growth Audit, CTA 'Book a Call'
2. Click each header link => each page loads with its own H1 (Services, Industries, Use Cases, Proof…, About, Growth Audit)
3. Open the footer links 'Become a Partner', 'Partner Login', 'Privacy Policy' => /partners, /partner/login, /privacy load
4. Open http://localhost:3100/work and /resources => 404 page ('This page took a wrong turn') — these are listed in the sitemap but not routable (record as defect DEF-SITEMAP)

> Tester note: app/sitemap.ts lists /work and /resources whose folders are app/_work and app/_resources (private). Known discrepancy.

#### ENTRY-02 — Contact form

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Visitor |
| Preconditions and test data | NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY is blank locally (expected). |
| Start route / navigation | /contact |
| Final expected state | No database row is created by this form (confirm in ENTRY-02 tester note). |
| Observable evidence | Screenshot of the result state. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Web3Forms key (external); sends real email when configured |
| Requirement IDs · route/action · resulting state | n/a · /contact · components/ContactForm.tsx · none |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Leave every field empty and click **Request Consultation** => the form has `noValidate`; the request goes to the third-party Web3Forms endpoint; locally (no key) an error or nothing useful appears — record exactly what is shown
2. Fill Name 'Test Visitor', Business Email 'visitor@growthos-test.example.com', Service, Timeline 'Just exploring', Message 'synthetic test' and submit => with a key configured the success panel 'Thank you — request received.' appears

> Tester note: Confirmed from code: ContactForm posts to Web3Forms only; there is no server validation, no rate limit, no DB record, no attribution. Record as gap G-ENTRY-1 (enquiries leave no trace in the product). Do not test on production — it emails the live inbox.

#### ENTRY-03 — Growth Audit wizard — start

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local + configuration |
| Account and role | Visitor |
| Preconditions and test data | GEMINI_API_KEY blank locally: the scrape/profile step will fail or degrade. Record behaviour; full run needs a key (staging). |
| Start route / navigation | /growth-audit#start |
| Final expected state | A `Lead` row with an EvidencePack exists for each start (admin: /admin/leads). |
| Observable evidence | Admin Leads table row; screenshot. |
| Negative / alternate path | ENTRY-04 |
| Cleanup | Leave rows; they are marketing leads not tenant data. Delete via DB only if needed. |
| External access / cost / publication | Gemini/LLM key for the profile step; scraping fetches the URL you type |
| Requirement IDs · route/action · resulting state | n/a · /growth-audit, POST /api/audit/scrape · scrape route · Lead.status intake |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Enter Website URL 'https://example.com' and Email 'audit-1@growthos-test.example.com', click **Start the audit** => button shows 'Reading your site — this takes a moment…'; then step 1 'Here's what we understood…' (or an error message if the model key is absent)
2. Submit the same email a 6th time within the hour from the same machine => rate-limited response (5 scrapes/hour/IP) — the UI must show a message, not hang
3. Tick 'I don't have a website yet', enter Business name 'Synthetic Clinic', email as above => the wizard proceeds without a scrape

> Tester note: Rate limit is in-memory per server instance. No bot protection on this route.

#### ENTRY-04 — Growth Audit wizard — submit and duplicate

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser + API · Local + configuration |
| Account and role | Visitor |
| Preconditions and test data | ENTRY-03 reached the intake steps. |
| Start route / navigation | /growth-audit (continue) |
| Final expected state | Report row exists in `generating`/review state; no email sent at submit; no workspace or engagement was created (check /admin/os → All organizations: none new). |
| Observable evidence | 409 response screenshot; admin review row. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Report pipeline needs the model key; approval sends email when Resend is configured |
| Requirement IDs · route/action · resulting state | n/a · POST /api/audit/submit, /admin/reviews · submit route; admin/reviews actions · Report.status generating → approved |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Answer every step (goal, B2B/B2C, areas, budget, start, decision maker) and click **Finish & generate my report** => 'That's everything — thank you.' with **View my report page**
2. Click **View my report page** => /growth-audit/report/<token> shows badge 'In review' and 'Your report is being reviewed'
3. Using the browser devtools Network tab, re-send the same POST /api/audit/submit body => HTTP 409 'Already submitted'
4. Sign in as operator at /admin/login, open /admin/reviews => the lead appears with status; open it => report preview, **Approve & deliver** requires 'Your name'

> Tester note: Confirms that form submission does NOT create a workspace. Report email is sent only after approval and only with RESEND_API_KEY; locally it is logged.

#### ENTRY-05 — Booking checkout (deposit)

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local + configuration |
| Account and role | Visitor |
| Preconditions and test data | STRIPE_SECRET_KEY blank locally (expected → refusal). On staging use sk_test only. |
| Start route / navigation | /industries → an industry program → tier 'Book' button (/book?slug=…&tier=…) |
| Final expected state | No application DB row is written by /api/book (it only creates a Stripe session). |
| Observable evidence | Screenshot; Stripe test dashboard session (staging). |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Stripe test mode; never live keys |
| Requirement IDs · route/action · resulting state | n/a · /book, POST /api/book, /book/success · book route · none |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Open the booking page => H1 'Book {program} — {tier}' and an order summary; deposit is 50% of the onboarding fee
2. Submit with an empty Phone => browser/server validation error; nothing is sent to Stripe
3. Fill Your name, Email 'book-1@growthos-test.example.com', Phone, tick one add-on and submit => locally: an error because Stripe is not configured; staging: redirect to Stripe Checkout (test mode) — DO NOT complete a payment unless authorised
4. On staging click the Stripe back link => /book?…&canceled=1 shows the amber 'nothing was charged' banner

> Tester note: Amounts are recomputed server-side; a tampered price in the request must not change the Stripe line items — verify by editing the POST body in devtools (staging).

#### ENTRY-06 — Public lead-capture form (hosted page)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Visitor |
| Preconditions and test data | Seed done: Brightside has an active LosCampaign 'Book a consult (demo form)'. Get its publicId from /app/campaigns (signed in as owner) → open the campaign → 'Public page' URL. |
| Start route / navigation | http://localhost:3100/app/c/<publicId>?utm_source=test&utm_medium=manual&utm_campaign=<code> |
| Final expected state | One lead, consent evidence stored before the lead, attribution recorded once, a `trigger.form_submitted` event dispatched (visible in a workflow run if one is active). |
| Observable evidence | Lead detail Provenance card screenshot. |
| Negative / alternate path | ENTRY-07 |
| Cleanup | Delete the lead via **Delete lead** (soft delete) or leave (demo org). |
| External access / cost / publication | None locally |
| Requirement IDs · route/action · resulting state | C-JRN-03 · /app/c/[publicId], POST /api/leados/public/forms/[publicId] · processSubmission · LosLead new; LosFormSubmission |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Load the page => campaign headline, form fields, required consent checkbox, footer 'Privacy & data requests'
2. Submit with the consent box unticked => refused with a visible message (consent is required server-side too)
3. Fill First name 'Priya', Email 'priya-1@growthos-test.example.com', Phone '+919999900001', tick consent, click the CTA => success card; 'Book a time that suits you →' if a calendar link is set
4. Submit the identical form again => success shown; in /app/leads the lead is NOT duplicated (existing B2C lead updated, intent +20)
5. Fill the hidden `website` honeypot via devtools and submit => 'Thank you!' shown but no lead created
6. Sign in as owner; open /app/leads => 'Priya' appears with source form; open the lead => Provenance shows the UTM values and attribution kind

> Tester note: Rate limits: 10/min per IP and 120/min per form. Turnstile only when TURNSTILE_SECRET_KEY is set. Never use real people.

#### ENTRY-07 — Public form — suppressed contact and inactive campaign

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Visitor + Operator |
| Preconditions and test data | ENTRY-06 done. Operator signed in at /admin. |
| Start route / navigation | /admin/leados/suppressions |
| Final expected state | Suppressed contact cannot be captured; paused campaign page is unavailable. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Resume the campaign (**Resume campaign**). The suppression stays global — use a throwaway address. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-03 · /admin/leados/suppressions, /app/c/[publicId] · addSuppression, setCampaignStatus · LosSuppression; LosCampaign paused |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Add Email 'priya-1@growthos-test.example.com', Note 'test', click **Suppress globally** => row appears with a contact hash (no clear-text)
2. Submit the public form again with that email => polite rejection; no new lead; in /app/leads the lead shows 'suppressed'
3. As owner, open /app/campaigns/<id> and click **Pause** => status paused; reload the public page => not available (campaign must be active)

> Tester note: Suppression is keyed by hash and spans tenants.

#### ENTRY-08 — Partner referral entry

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Visitor |
| Preconditions and test data | None. |
| Start route / navigation | /partners |
| Final expected state | A PartnerApplication draft exists (unsubmitted). |
| Observable evidence | URL with token; screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /partners · saveStep · PartnerApplication draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Read the hero => stats 'Commission 30%', 'Opportunity protection 90 days'; 'Apply to the Sales Partner Program' form with Your name, Email address, LinkedIn profile (optional)
2. Enter name 'Pat Partner', email 'partner-test@growthos-test.example.com', click **Continue partner application** => redirected to /partners/apply?t=<token> with the name prefilled

> Tester note: Continue in PTR-01. No workspace/engagement is created by any public form (confirmed in code).

#### ENTRY-09 — Privacy request intake (public)

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Visitor |
| Preconditions and test data | None. |
| Start route / navigation | /app/privacy |
| Final expected state | LosPrivacyRequest in_progress after verification. |
| Observable evidence | Admin queue row. |
| Negative / alternate path | — |
| Cleanup | Resolve the request in OPS-12 or leave it. |
| External access / cost / publication | Email delivery only with Resend |
| Requirement IDs · route/action · resulting state | n/a · /app/privacy, /app/privacy/verify/[token] · submitPrivacyRequest, verifyPrivacyRequest · LosPrivacyRequest |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Choose 'See what data you hold about me', email 'priya-1@growthos-test.example.com', click **Submit request** => confirmation; locally the verification link is logged in the dev server console (no Resend key)
2. Open the logged /app/privacy/verify/<token> link => 'Identity confirmed'
3. Submit 6 requests within an hour from one IP => the 6th is rate-limited (5/hour)
4. Operator: /admin/leados/privacy-requests => the request appears with a 30-day due date

> Tester note: Deletion completion is irreversible (hard delete) — only run OPS-12 against synthetic data.


### B. Access

#### AUTH-01 — Password login / logout

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Seed done. |
| Start route / navigation | /app/login |
| Final expected state | Session row revoked on logout. |
| Observable evidence | Screenshots; Settings → Security 'Active sessions' before/after. |
| Negative / alternate path | AUTH-02 |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-REL-01 · /app/login · login, logout · LosSession |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Enter the owner email with a wrong password, click **Sign in** => 'Incorrect email or password.' (identical message for unknown users)
2. Enter the correct password => redirected to /app/dashboard; sidebar shows the workspace switcher with 'Brightside Dental (demo)' and 'Northwind Robotics (demo)'
3. Open http://localhost:3100/app => redirected to /app/dashboard while signed in
4. Click the sign-out icon (title 'Sign out') => back at /app/login; open /app/dashboard => redirected to /app/login

> Tester note: Cookie `los_session` is httpOnly; token only stored hashed. Login rate limit is 20 attempts / 15 min per IP.

#### AUTH-02 — Login rate limit and disabled account

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Visitor |
| Preconditions and test data | None. |
| Start route / navigation | /app/login |
| Final expected state | Limiter resets. |
| Observable evidence | Screenshot of the limited message. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/login · login · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Submit 21 wrong-password attempts for 'nobody@growthos-test.example.com' within 15 minutes => the 21st shows a rate-limit message rather than the generic error
2. Wait 15 minutes (or restart the dev server, which clears the in-memory limiter) => login works again

> Tester note: Disabled users (LosUser.disabledAt) get the same generic message; there is no UI to disable a user — mark 'Not applicable (no UI)' unless set via DB.

#### AUTH-03 — Password reset

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Owner (signed out) |
| Preconditions and test data | Dev server console visible (reset link is logged, not emailed). |
| Start route / navigation | /app/forgot |
| Final expected state | Password changed; old sessions gone. |
| Observable evidence | Console link (redact token in evidence); screenshots. |
| Negative / alternate path | — |
| Cleanup | Reset the password back to the seed value via the same flow (or re-seed). |
| External access / cost / publication | Email needs Resend on staging |
| Requirement IDs · route/action · resulting state | n/a · /app/forgot, /app/reset · requestPasswordReset, resetPassword · LosEmailToken usedAt |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Enter 'unknown@growthos-test.example.com', click **Send reset link** => 'If that account exists…' (same message for known and unknown)
2. Enter the owner email => same message; the dev console prints a link /app/reset?token=…
3. Open the link, enter a new password of 9 characters => refused ('At least 10 characters')
4. Enter a 12-character password, click **Update password** => success with **Sign in** link; every other session of that user is revoked
5. Open the same reset link again => 'This reset link is invalid or expired.'
6. Sign in with the new password => dashboard

> Tester note: Reset tokens live 1 hour and are single-use; 5 requests/hour/IP.

#### AUTH-04 — Registration gate (no self-service)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Visitor |
| Preconditions and test data | GROWTHOS_SELF_SERVICE is off (default). |
| Start route / navigation | /app/register |
| Final expected state | No LosUser created. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/register, /app/onboarding · register, createOrg · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Fill Full name, Work email 'random-1@growthos-test.example.com', a 12-char password, click **Create account** => refused because no pending invitation exists (message shown; identical whether or not the email exists)
2. Open /app/onboarding while signed in as a user with memberships => redirected to the dashboard (org creation is off)

> Tester note: Owner decision recorded (GROWTHOS_DECISIONS #27): self-service off. Re-test with GROWTHOS_SELF_SERVICE=on only if the owner turns it on.

#### AUTH-05 — Invite a restricted member

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) then the invitee |
| Preconditions and test data | Signed in as owner in Brightside; dev console visible. |
| Start route / navigation | /app/settings/team |
| Final expected state | Membership analyst in Brightside only; not in Northwind. |
| Observable evidence | Team page members list; screenshot of the analyst sidebar. |
| Negative / alternate path | AUTH-06 |
| Cleanup | Keep this account for later tests. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/settings/team, /app/invite/[token] · inviteMember, acceptInvite · LosInvitation acceptedAt; LosMembership |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Under 'Invite a teammate' enter Email 'analyst-a@growthos-test.example.com', Role 'analyst', click **Invite** => appears under 'Pending invitations'; console logs the /app/invite/<token> link (7-day expiry)
2. Try inviting with Role 'owner' => not offered in the select (owner cannot be invited)
3. Sign out; open the invite link => 'Join Brightside Dental (demo)' with the role badge; enter Your name 'Ana Analyst' and a 12-char password, click **Accept invitation** => /app/dashboard as analyst
4. Sidebar => no 'AI Studio', no 'Settings → Team' invite form (read-only member list), 'Approvals' visible but decisions refused (see SCOPE/CONT tests)
5. Open the same invite link again => 'Invitation invalid' (already accepted)

> Tester note: Analyst holds leads.view, campaigns.view, reports.view, work.view only.

#### AUTH-06 — Revoked and expired invitations

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Owner signed in. |
| Start route / navigation | /app/settings/team |
| Final expected state | Revoked/expired links cannot be accepted. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/invite/[token] · revokeInvite, acceptInvite · LosInvitation revokedAt |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Invite 'revoke-me@growthos-test.example.com' as 'sales_rep' => pending row with **Revoke**
2. Click **Revoke** => row disappears; open the logged invite link => 'Invitation invalid'
3. Technical: in the local DB set an invitation's expiresAt to yesterday (or wait 7 days) and open its link => 'Invitation invalid'

> Tester note: No sweeper deletes expired invites; expiry is checked at accept time.

#### AUTH-07 — Email verification on registration

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local + configuration |
| Account and role | Visitor |
| Preconditions and test data | GROWTHOS_SELF_SERVICE=on set for the dev server (restart) — configuration test only. |
| Start route / navigation | /app/register |
| Final expected state | Self-service path works only when explicitly enabled. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Wipe is not automatic (org not demo) — delete via DB or ignore. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/register, /app/verify, /app/onboarding · register, verifyEmailToken, createOrg · LosUser emailVerifiedAt; LosOrg |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Create 'verify-1@growthos-test.example.com' => account created; sign-in refused until verified; console shows /app/verify?token=…
2. Open the link => 'Email verified' + **Sign in to continue**; open it again => 'Link invalid or expired'
3. Sign in => /app/onboarding 'Set up your organization'; submit without ticking the two checkboxes => refused; tick and submit => org created, you are owner

> Tester note: Turn the flag off again afterwards. Verification tokens last 24 h.

#### AUTH-08 — MFA enrolment, login challenge, fail-closed

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | analyst-a@growthos-test.example.com (analyst, invited in AUTH-05) |
| Preconditions and test data | AUTH-05 done; an authenticator app available. |
| Start route / navigation | /app/settings/security |
| Final expected state | MFA state toggled and enforced. |
| Observable evidence | Screenshots (mask the secret). |
| Negative / alternate path | — |
| Cleanup | Leave MFA off. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/settings/security, /app/mfa · startMfaSetup, confirmMfa, verifyMfa, disableMfa · LosUser mfaEnabledAt; LosSession mfaPending |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Click **Set up MFA** => secret and otpauth URI shown once; add to the authenticator
2. Enter a wrong code and click **Turn on MFA** => refused; enter the current code => MFA on
3. Sign out and sign in => redirected to /app/mfa 'Two-factor verification'; open /app/dashboard directly => bounced back to /app/mfa
4. Enter a wrong code 11 times => rate-limited (10/15 min); enter the right code => dashboard
5. Back on Security click **Turn off MFA** with the current code => off

> Tester note: If LEADOS_SECRET rotates, MFA fails closed ('ask an administrator to reset'), never bypasses.

#### AUTH-09 — Session list and remote revocation

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Sign in as owner in two different browsers (or one normal + one private window). |
| Start route / navigation | /app/settings/security |
| Final expected state | Only browser A's session remains valid. |
| Observable evidence | Screenshots of the list before/after. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/settings/security · revokeSession, revokeOtherSessions · LosSession revokedAt |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. In browser A open Security => 'Active sessions' lists two rows, one badged 'this device'
2. Click **Revoke** on the other row => browser B's next navigation lands on /app/login
3. Sign in again in B; in A click **Sign out other sessions** => B is signed out again; A stays

> Tester note: Session lifetime 30 days; expiry cannot be forced from the UI (technical: set LosSession.expiresAt in the past, then any request → login).

#### AUTH-10 — Workspace switching

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Owner is a member of both demo workspaces. |
| Start route / navigation | /app/dashboard |
| Final expected state | Nav is entitlement-driven per workspace. |
| Observable evidence | Two sidebar screenshots. |
| Negative / alternate path | AUTH-11 |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-REL-01 · /app/dashboard, /app/denied · switchOrg · los_org cookie |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Use the sidebar select (aria-label 'Switch workspace') to choose 'Northwind Robotics (demo)' => redirected to /app/dashboard; header shows Northwind; nav has no Content/AI Studio/Leads (no content module, no aiTools, no crm)
2. Open /app/leads => /app/denied?why=scope 'This area isn't part of this workspace' with **Go to Home**
3. Open /app/studio => redirected/denied (no ai.use tools in this workspace)
4. Switch back to Brightside => nav shows Content, AI Studio, Leads, Pipeline, Discover, Deliveries, Lead reports

> Tester note: Tampering the `los_org` cookie to an org you are not a member of must fall back to your first membership (AUTH-11).

#### AUTH-11 — Cross-workspace access attempts

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser + technical · Local (dev-verify, http://localhost:3100) |
| Account and role | analyst-a@growthos-test.example.com (analyst, invited in AUTH-05) (member of Brightside only) |
| Preconditions and test data | AUTH-05 done. Note a Northwind engagement id and a Northwind work item id (as owner, from the URLs). |
| Start route / navigation | /app/dashboard as analyst |
| Final expected state | No cross-tenant read or write. |
| Observable evidence | Screenshots of 404s and export JSON header. |
| Negative / alternate path | — |
| Cleanup | Clear the cookie edit. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-REL-01 · /app/engagement/[id], /app/work/[id], /api/os/export · requireOrg · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Open /app/engagement/<northwind engagement id> => 404 (not found), never Northwind data
2. Open /app/work/<northwind work item id> => 404
3. Open /api/os/export => JSON export contains only Brightside data
4. Devtools → Application → cookies: set `los_org` to the Northwind org id (copy from an owner session URL /admin/os/<orgId>) and reload /app/dashboard => still Brightside (cookie only selects among your own memberships)
5. Open /app/settings/team and try to submit the invite form via devtools => 'Forbidden.' message (analyst lacks team.manage)

> Tester note: Every page and action derives orgId from the membership row; ids from forms are re-checked against the org.

#### AUTH-12 — Direct links when signed out; role and scope denial screens

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Visitor, then analyst-a@growthos-test.example.com (analyst, invited in AUTH-05) |
| Preconditions and test data | None. |
| Start route / navigation | Signed-out browser |
| Final expected state | Refusals are screens or inline messages. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-REL-01, C-REL-02 · /app/denied · requireOrgPage · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Open /app/approvals, /app/studio, /app/settings/ai-credits, /app/engagement => each redirects to /app/login (no 500, no blank page)
2. Sign in as analyst; open /app/settings/billing => /app/denied?why=role 'Your role can't open this' with **Raise a request**
3. Open /app/ops (staff only) => redirected to /app/dashboard
4. Open /app/discover (lead_supply module present in Brightside) => loads; click **Preview cost** after selecting a result => refusal alert (analyst lacks leads.edit), never an empty result

> Tester note: error.tsx is only for unexpected failures; force it (XQ-09) separately.

#### AUTH-13 — Role change during an active session

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) and analyst-a@growthos-test.example.com (analyst, invited in AUTH-05) |
| Preconditions and test data | Analyst signed in in browser B on /app/leads. |
| Start route / navigation | /app/settings/team (owner, browser A) |
| Final expected state | Permission changes apply on the next request without re-login. |
| Observable evidence | Screenshots before/after. |
| Negative / alternate path | — |
| Cleanup | Analyst role restored. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/settings/team · changeMemberRole, removeMember · LosMembership role |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Change the analyst's role select to 'campaign_manager' => saved; audit team.role_changed
2. In browser B reload => sidebar now shows AI Studio (campaign_manager has ai.use) and Lead capture management
3. Owner tries to change their own role or a staff member (lead@) role via the select => not offered / silently no-op (staff rows are not editable by clients)
4. Owner clicks **Remove** on the analyst row and confirms => browser B next navigation lands on /app/onboarding or login (no memberships)
5. Re-invite analyst-a as 'analyst' and accept (AUTH-05 steps) => back to restricted

> Tester note: Owner cannot be removed; self-removal is a silent no-op.

#### AUTH-14 — Operator (admin portal) login

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | dev-verify running (it defines a local ADMIN_ACCOUNTS entry and a throwaway ADMIN_SESSION_SECRET). |
| Start route / navigation | /admin/login |
| Final expected state | Operator session cookie set (no expiry inside the token — note as observation). |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-SAFE-03 · /admin/login, /admin/os · POST /api/admin/login · admin_session cookie |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Open /admin/os signed out => redirected to /admin/login
2. Sign in with a wrong password => refused
3. Sign in with the local operator credentials from scripts/dev-verify.mjs => /admin/reviews; nav shows Reviews, Leads, Custom Plans, Applications, Partners, Deals, GrowthOS
4. Open /admin/os => 'CatalystGrowthOS' header with organization counts and the scheduler banner

> Tester note: Passwords in ADMIN_ACCOUNTS are compared in plain text (observation O-AUTH-1). The dev-verify secret is refused in production (tested in release-gaps).

#### AUTH-15 — Social sign-in buttons (Google/Microsoft)

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local + configuration |
| Account and role | Visitor |
| Preconditions and test data | OAuth client ids not configured locally. |
| Start route / navigation | /app/login |
| Final expected state | Buttons only appear when configured; failure returns a clear state. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Google/Microsoft OAuth apps |
| Requirement IDs · route/action · resulting state | n/a · /api/leados/oauth/[provider]/start/callback · n/a · LosSession |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Observe the login page => 'Continue with Google / Microsoft' buttons are hidden when the provider is not configured
2. Staging with providers configured: click **Continue with Google** => provider consent → back at /app/dashboard or /login?oauth=failed on cancel

> Tester note: State cookie los_oauth_state must match; tamper it (staging) → failure page, not a session.


### C. Scope

#### SCOPE-01 — Proposal creation with services, AI tools, included credits

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | Workspace C exists (OPS-02) with its engagement in stage prospect. |
| Start route / navigation | /admin/os/<orgC id> → 'Propose scope' |
| Final expected state | Two proposed contracts on workspace C; no wallet grant yet (check /admin/os/credits → Wallets: workspace C has 0). |
| Observable evidence | Contracts table screenshot; credits console wallet row. |
| Negative / alternate path | SCOPE-04 |
| Cleanup | Decline the second proposal in SCOPE-03. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-02, C-CR-12 · /admin/os/[orgId] · proposeContract · CosContract proposed; CosEngagement proposal |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Kind 'Program', Program any, Tier 'growth', tick services 'social' and 'content', tick AI tools 'LinkedIn post', 'X post', 'Campaign brief & content ideas', leave 'Article draft' unticked; Included AI credits 40; expire days 30; Pricing note 'synthetic' => click submit => contract listed as 'proposed'; engagement stage moves to 'proposal' with next action 'Review and sign the proposed scope' (client side)
2. Repeat with Included AI credits 10 and NO AI tools ticked => refused: credits without a tool are rejected
3. Repeat with Included AI credits 10 and tools ticked, 'ADDITIONAL credits' unticked => refused because the workspace already has a credit-bearing scope; tick 'ADDITIONAL credits' => accepted as a second proposed contract (kind 'change')

> Tester note: Unknown tool keys are dropped server-side; services outside the catalogue are dropped. Proposals have no expiry field (gap G-SCOPE-1: 'expired proposal' is not modelled; only decline/end).

#### SCOPE-02 — Client-visible scope and signature

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner-c@growthos-test.example.com (owner of workspace C, provisioned in OPS-02) |
| Preconditions and test data | SCOPE-01 done; owner-c accepted the provisioning invite (OPS-02). |
| Start route / navigation | /app/dashboard |
| Final expected state | Contract active; workspace kind client; included grant with sourceRef contract:<id>; checklist seeded. |
| Observable evidence | Screenshots of the card, credits page, checklist. |
| Negative / alternate path | SCOPE-03, SCOPE-04 |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01, C-CR-12, C-AI-01 · /app/dashboard · signContract · CosContract active; CosCreditGrant included |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Dashboard shows the proposed-scope card with services, AI tools and 'Included AI credits: 40 (expire in 30 days)' and buttons **Sign & activate** / **Decline** => visible
2. Before signing open /app/studio => denied/redirect (a proposed scope grants no tools); /app/content => /app/denied?why=scope
3. Click **Sign & activate** on the first proposal => card disappears; nav now shows Content and AI Studio; engagement stage 'accepted' then onboarding checklist seeded
4. Open /app/settings/ai-credits => Balance shows Included 40, Available 40, expiry date listed under expiring grants
5. Open /app/engagement/<id> => 'Access, assets and inputs' lists intake items from the social/content templates (e.g. social accounts, approved claims, brand assets)

> Tester note: Signature = the contract.sign permission (owner only) + the proposal still 'proposed'. No typed name or e-sign artefact exists (record as observation O-SCOPE-1 if the business expects one).

#### SCOPE-03 — Decline a proposal; repeat submission

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner-c@growthos-test.example.com (owner of workspace C, provisioned in OPS-02) |
| Preconditions and test data | SCOPE-02: the second (additional) proposal is still proposed. |
| Start route / navigation | /app/dashboard |
| Final expected state | A decided contract cannot be re-decided; the engagement is not declined while another contract is active. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-CR-12 · /app/dashboard · signContract · CosContract declined |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Click **Decline** on the remaining proposal => card gone; contract shows 'declined' in /admin/os/<org>; no grant added (balance unchanged)
2. Open the dashboard in two tabs before declining a fresh proposal (operator creates one more), click **Sign & activate** in tab 1 then **Decline** in tab 2 => tab 2 shows 'Contract not found or already decided.'; exactly one outcome persists
3. Reload => no proposal card

> Tester note: Atomic updateMany claim in signContract; tested concurrently in completion-signing (5 signatures → 1 grant).

#### SCOPE-04 — Non-owner cannot sign; staff cannot sign

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | analyst-a@growthos-test.example.com (analyst, invited in AUTH-05) / lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | A proposed contract exists on Brightside (operator creates one with kind 'addon', service 'analytics', no credits). |
| Start route / navigation | /app/dashboard |
| Final expected state | Only owners sign; staff never. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Operator: **End** the add-on contract if you do not want analytics in scope (super_admin only). |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/dashboard · signContract · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. As analyst (Brightside) => the proposal card shows 'Only a workspace owner can sign.' and no buttons
2. As lead@ (cgo_lead) => same message; submit the sign form via devtools => 'Forbidden.' message, contract remains proposed
3. As owner@ => **Sign & activate** works

> Tester note: Separation of duties (contract.sign is owner-only).

#### SCOPE-05 — Included credits granted exactly once; historical contracts

| Field | Value |
|---|---|
| Priority / type / environment | P0 · API/action + technical · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) + owner-c@growthos-test.example.com (owner of workspace C, provisioned in OPS-02) |
| Preconditions and test data | SCOPE-02 done. |
| Start route / navigation | /admin/os/credits |
| Final expected state | Each grant keyed to its own contract; ended contracts never receive allowances. |
| Observable evidence | Transactions list; vitest output. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-CR-12 · /admin/os/credits, /app/settings/ai-credits · grantIncludedForContract · CosCreditGrant sourceRef contract:<id> |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Wallets table => workspace C shows Included 40 and 'Ledger check: balanced'; Transactions on the client page show ONE 'Credits added' row with reference contract:<id>
2. Technical: run `npx vitest run tests/os/completion-signing.test.ts` => passes (5 concurrent signatures grant once; failed signature leaves nothing)
3. Operator ends the active contract (**End**, super_admin) then proposes and the owner signs a new one WITHOUT the additional-credits tick and 0 credits => no new grant; balance unchanged
4. Propose one with 20 credits + 'ADDITIONAL' ticked; owner signs => a second grant of 20 with a different contract:<id> reference

> Tester note: The legacy tier placeholder allowances.aiCredits is never converted (decision 34).

#### SCOPE-06 — Entitlement activation and four independent controls

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside seed: aiTools = all except blog_article and image; balance 60. |
| Start route / navigation | /app/studio |
| Final expected state | Scope, tool entitlement, balance and permission remain independent. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None (promotional credits stay; note in tracker). |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-AI-01, C-AI-02 · /app/studio, /app/studio/[tool] · toolAvailability · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Tool cards => 'Article draft' and 'Image generation' show 'Unavailable — …ask Catalyst about adding it'; balance pill shows 60
2. Open /app/studio/blog_article directly => redirected to /app/studio
3. Operator grants 100 promotional credits to Brightside (OPS-05) => reload Studio: balance 160, 'Article draft' STILL unavailable (credits never unlock tools)
4. Switch to Northwind (aiTools empty) => AI Studio not in nav; /app/studio denied even though the owner has ai.use

> Tester note: toolAvailability checks entitlement first; staff-internal runs bypass client entitlement (Catalyst pays).

#### SCOPE-07 — Change request from out-of-scope work; client approval; paid change charged once

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) then owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside services: social, content, crm, analytics. Seed already has a change request 'Google Ads pilot for implants' (paid-ads, ₹30,000) awaiting approval. |
| Start route / navigation | /app/work (lead@) |
| Final expected state | Out-of-contract work never silently becomes billable; paid change → owner only → charged once. |
| Observable evidence | Approval card, commercial record row. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-04 · /app/work, /app/work/[id], /app/approvals · newWorkItem, requestChangeApproval, decide · CosWorkItem change_request; CosApproval; CosCommercialRecord change |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Click **New work item**: Title 'Landing page rebuild', Type Task, Service 'website', click **Create** => item created as type change_request with a scope-change banner; state scoped
2. Open the item; click **Send to the client for approval** => 'Approvals' badge for the client increments; approval status requested (expires in 14 days)
3. Try **→ ready** on the item => refused (out of scope until approved)
4. Sign in as owner → /app/approvals => the request card shows 'scope change'; set Incremental charge first? (staff sets it on the item: Incremental charge 30000) then owner clicks **Approve** => since a charge > 0 requires spend.approve (owner has it) the approval succeeds; item now in scope; one commercial record 'change' appears on /app/engagement/<id> → Commercial record
5. Owner clicks **Approve** again / reload => no second record (unique per work item)
6. As analyst open /app/approvals for the seeded 'Google Ads pilot' => 'Spend, releases and paid scope changes need a workspace owner.'

> Tester note: Staff cannot approve (no approvals.decide/spend.approve).

#### SCOPE-08 — Contract revision (scope change kind) after work began

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) + owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside active. |
| Start route / navigation | /admin/os/<brightside id> |
| Final expected state | Entitlements = union of ACTIVE contracts; ended scope stays in history. |
| Observable evidence | Screenshots of nav before/after. |
| Negative / alternate path | — |
| Cleanup | Re-propose and sign the original program scope to restore Brightside for later tests (or re-seed). |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /admin/os/[orgId] · proposeContract, endContract, signContract · CosContract change active; program ended |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Propose scope with Kind 'Scope change', service 'seo', AI tool 'SEO brief & metadata', no credits => proposed
2. Owner signs => entitlements now include seo + the tool; existing work items unaffected; nav shows Search
3. Operator: **End** the original program contract (super_admin) => Content module disappears if no other active contract carries it; existing content history still visible? Check: /app/content => /app/denied?why=scope while /app/work still lists old items

> Tester note: Contracts are never edited after signing; a change is a new row with parentId.


### D. Onboarding

#### ONB-01 — Business profile save / edit / reload

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner-c@growthos-test.example.com (owner of workspace C, provisioned in OPS-02) |
| Preconditions and test data | Workspace C signed (SCOPE-02). |
| Start route / navigation | /app/strategy/profile |
| Final expected state | Versioned CosBusinessProfile; discovery_profile auto-resolved. |
| Observable evidence | Screenshots before/after; checklist row. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/strategy/profile · profileSave · CosBusinessProfile version n; CosChecklistItem available |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Page shows 'Business profile · 0 of 12 sections filled' => fill Business model 'Dental clinic, private pay', Audience 'Adults 30–55 in Pune', Offers 'Implants, aligners', Content pillars: nine lines => click **Save profile**
2. => saved; 'n of 12 sections filled' updates; Content pillars limited to 8 (the ninth is dropped — verify the saved list)
3. Reload the page => values persist; open /app/engagement/<id> => checklist item 'Discovery profile' now 'available' with note 'Discovery profile completed.'
4. Enter 4,001 characters in Constraints and save => value truncated/capped at 4000 (verify length after reload)
5. As analyst (Brightside) open /app/strategy/profile and submit the form via devtools => refusal message (needs os.settings, work.request or work.manage) — note: analyst lacks all three

> Tester note: No required-field validation exists (record O-ONB-1 if the business expects mandatory fields). Version increments on each save.

#### ONB-02 — Objectives (goals) and goal focus

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | Brightside; lead@ has strategy.manage. |
| Start route / navigation | /app/strategy |
| Final expected state | Goals persist with agreedAt/By. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/strategy · saveGoal, archiveGoal · CosGoal |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Goals' shows the seeded 'Booked consultations' 40/month (current 14, measured) => click **Add goal**: Metric 'New patient enquiries', Target 120, Unit 'per month', Horizon '6 months' => appears
2. Submit with Target empty => validation message
3. Click **Archive** on the new goal => disappears from the list (archivedAt set)
4. As owner: the goal form is also available (org.manage) => add and archive one

> Tester note: currentLabel measured/estimated/unavailable must be shown as-is; never a fabricated number.

#### ONB-03 — Approved claims: only the client approves

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) then owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside seed: claim '1200 patients treated since 2015' approved; 'Most consults…' proposed. |
| Start route / navigation | /app/strategy/profile → Approved claims |
| Final expected state | Claims approved only by client; retired claims cannot be attached. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-AI-03 · /app/strategy/profile · claimPropose, claimDecide · CosClaim proposed→approved/retired |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. As specialist: propose claim 'Open 7 days' (7 chars) => refused 'Write the claim out in full' (min 8); propose 'Open seven days a week' with source 'Clinic fact sheet 2026' => listed as proposed
2. As specialist click **Approve for use** on it (submit via devtools if hidden) => refused (approvals.decide is client-only)
3. As owner click **Approve for use** => status approved, approvedBy = owner; click **Retire** on the seeded proposed claim => retired
4. Open /app/content/<master id> => 'Sources and approved claims' offers only approved claims

> Tester note: Claims feed the AI grounding (unsupportedClaims validator).

#### ONB-04 — Source material: https only, excerpt cap, asset link

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | Brightside. |
| Start route / navigation | /app/strategy/profile → Source material |
| Final expected state | Sources exist and are selectable per Studio run. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-AI-09 · /app/strategy/profile · sourceAdd · CosSource |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Add Source Title '' => refused (title required)
2. Title 'Pricing sheet', url 'http://example.com/x' => refused (https only)
3. Title 'Pricing sheet', url 'https://example.com/pricing', Key passage of 6,500 chars => saved; excerpt capped at 6000
4. Upload a PDF in Assets as 'Source material' (AST-01) then add a source linked to that asset => source lists the asset

#### ONB-05 — Brand profile (workspace) feeds AI

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside. |
| Start route / navigation | /app/settings/workspace → Brand profile |
| Final expected state | Brand profile stored on CosWorkspace.brandProfile. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-AI-03 · /app/settings/workspace · saveBrandProfile · CosWorkspace.brandProfile |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Fill Voice & tone 'Warm, plain English', Never 'no prices', Competitors 'Smile Co' and click **Save** => 'every AI draft now uses it' style confirmation; audit brand.updated
2. Run AI-01 (LinkedIn post) => the draft respects the 'Never' note (stand-in model returns a fixed [TEST DRAFT]; with a real model check the constraint is honoured — usefulness criterion)
3. As analyst submit the form => refusal (os.settings)

> Tester note: Two brand stores exist (workspace brandProfile and business profile brandVoice) — both are read by prompts.

#### ONB-06 — Access requests and readiness blockers

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) then owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside engagement active with pending checklist items. |
| Start route / navigation | /app/engagement/<id> → Access, assets and inputs |
| Final expected state | Missing access blocks only dependent work; dependency list is human-readable. |
| Observable evidence | Screenshots of blocked item and checklist. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/engagement/[id], /app/work/[id] · checklistAdd, checklistResolve, transitionWorkItem · CosChecklistItem; CosDependency |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. As lead: **Add request** kind 'Access', 'What is needed' 'Google Business Profile admin', From client, Due next week => row appears pending, owner side client
2. As owner: click **Mark as provided** on it with note 'password is Abc123' => refused (notes containing 'password' are rejected); note 'Granted via Google invite' => status available; engagement History shows a note event
3. As owner: try **Not needed** on an item => not offered to clients (staff only)
4. As lead: on the seeded 'social accounts' access item (provider linkedin) click **Mark as provided** => refused: an access item naming a provider completes only when that connection verifies ('Connect the account → this completes itself')
5. As lead: create a project from the social template (**Create the delivery plan**, if not already) => milestones that 'need' social_accounts are blocked; open one → 'Blocked until…' listing the unmet dependency; **→ in_progress** refused
6. Connect the TEST account (Settings → Workspace → AccountsPanel → test account) => does the linkedin access item resolve? Expected: NO (provider mismatch) — record actual

> Tester note: syncAccessFromConnection resolves provider-named items only for that provider.

#### ONB-07 — Going active with open onboarding items requires a note

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | Workspace C engagement in 'onboarding' with pending checklist items. |
| Start route / navigation | /app/engagement/<C id> |
| Final expected state | Engagement active with dependent work still blocked. |
| Observable evidence | History entry. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/engagement/[id] · engagementMove, kickoffBuild · CosEngagement active |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Click **Move to active** with an empty note => refused (open checklist items need a written note)
2. Enter note 'Brand assets pending — content work waits' and move => stage active; History records the note; hold stays none

> Tester note: Kickoff summary (**Refresh from records**) must list the open items with owner side; it is facts-only.

#### ONB-08 — Changing information after work has begun

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside has published/approved content. |
| Start route / navigation | /app/strategy/profile |
| Final expected state | Master/brief changes only flag variants. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-AI-08 · /app/content/[id] · saveWorkItem, variantAckSource · CosContentVariant sourceChanged |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Change Audience text and save => profile version +1; existing approved variants are NOT revoked (profile is not part of the variant hash) — confirm on /app/content/<master> that the approved variant stays approved
2. Edit the master 'Core copy' and **Save master** => variants flagged 'source changed' (sourceChanged) but their approvals stand until the variant itself is edited; button **Reviewed against the new source** appears

> Tester note: Decision 18.


### E. Delivery

#### ENG-01 — Engagement stage machine and declines

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | Workspace C engagement (prospect → proposal after SCOPE-01). |
| Start route / navigation | /app/engagement/<id> |
| Final expected state | Transitions follow the NEXT table; accepted only via signature. |
| Observable evidence | History screenshots. |
| Negative / alternate path | — |
| Cleanup | Move C back to active for later tests (completed→offboarded is irreversible; do NOT hand over yet). |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/engagement/[id] · engagementMove · CosEngagement.stage |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Stage stepper shows the current stage; **Move to** buttons offer only allowed next stages (never 'accepted') => confirm 'accepted' is absent
2. From 'proposal' click **Move to declined** with empty reason => refused; with reason => allowed only if no contract is proposed/active (record actual)
3. From active: **Move to review**, then **Move to active**, then **Move to completed** => each writes a History stage event
4. Try any move on a 'declined' engagement (create a throwaway one via /admin/os/<org> New engagement and decline it) => no buttons

#### ENG-02 — Engagement terms, currency and payment status derivation

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) and owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside engagement (INR, monthly). |
| Start route / navigation | /app/engagement/<id> → Save terms |
| Final expected state | paymentStatus derived from records. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Stripe test mode for Pay by card |
| Requirement IDs · route/action · resulting state | C-PAY-06 · /app/engagement/[id] · engagementUpdate, recordCreate, recordIssue, recordPayment, recordPay · CosCommercialRecord issued→paid; paymentStatus |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Set Recurring fee 80000, Recurring cycle monthly, Renewal date = today+10, Review cycles 2 and **Save terms** => saved; 'Renewals in the next 60 days' on /admin/os lists it
2. Commercial record: **Add fee** kind 'other', Description 'Photo shoot', Amount 12000 => draft; **Mark invoiced** Invoice number 'INV-T1', Due date => issued; payment status on the header becomes 'invoiced'
3. **Record payment received** Amount 5000, Reference 'NEFT-1' => part_paid; Amount 7000 => paid; try Amount 1 more => refused (overpay)
4. As owner click **Pay by card** on an issued record => locally 'not configured' message; staging → Stripe test checkout
5. Header payment status is never editable directly => confirm no field exists

> Tester note: Void only when paidMinor = 0 and with a reason (recordVoid has no UI — record gap G-ENG-1).

#### ENG-03 — Delivery roadmap from a service template (all 14)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | A workspace whose active contract includes the service (use Brightside for social/content/crm/analytics; Northwind for website/software/branding; propose+sign the others on workspace C as needed). |
| Start route / navigation | /app/engagement/<id> → Scope and delivery roadmap → Create the delivery plan |
| Final expected state | 14 templates instantiate; out-of-scope → change request. |
| Observable evidence | Project pages (one screenshot per service). |
| Negative / alternate path | — |
| Cleanup | Cancel throwaway projects (**→ cancelled**). |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/engagement/[id] · roadmapStart (instantiateProject) · CosWorkItem project+milestones; CosDependency |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. For EACH service slug (ai-strategy, website, seo, paid-ads, social, content, video, crm, branding, automation, software, ecommerce, analytics, local): choose it, Title '<service> plan', click **Create the delivery plan** => a project work item plus one milestone per catalogue milestone (counts: website 9, software 8, video 8, seo 4, paid-ads 5, social 3, content 4, crm 4, branding 4, automation 5, ecommerce 4, analytics 3, local 5, ai-strategy 3)
2. Open the project => QA gate checklist lists the service's release-gate items; milestones show owner role, acceptance criteria, riskTier (launch/release/live = tier 3, publish = tier 2)
3. Create one for a service NOT in the contract => becomes a change_request with no milestones

> Tester note: Automated: completion-templates covers all 14 through the real action. Manual: at minimum social, website, video, analytics.

#### ENG-04 — Milestone flow with QA gate and client review

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed), lead@growthos-demo.example.com (cgo_lead, seed), owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Northwind: website project with milestone 'sitemap' in client_review (seed) and 'copy' pending. |
| Start route / navigation | /app/work |
| Final expected state | Full path with append-only work events. |
| Observable evidence | Activity log screenshot on the item. |
| Negative / alternate path | ENG-05 |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/work/[id], /app/approvals · moveWorkItem, decide · CosWorkItem states; CosApproval approved_with_edits |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. As specialist open milestone 'website.copy' => **→ in_progress** (blocked if dependency 'sitemap' not delivered — it is in client_review, so expect BLOCKED listing 'sitemap')
2. As owner /app/approvals → approve 'sitemap' => milestone approved; as specialist move it **→ delivered** => copy becomes unblocked
3. Specialist: copy **→ in_progress** → **→ internal_qa** => ok; lead tries **→ client_review** with an unticked QA checklist on the PROJECT => allowed for a milestone? Expected: milestone transitions do not need the project QA gate; the PROJECT cannot pass internal_qa with open milestones — verify by moving the project → internal_qa → client_review => refused while milestones open
4. Lead: milestone **→ client_review** => approval requested (client notified, 14-day expiry); as specialist try to approve via devtools => refused
5. Owner: **Approve with edits** with edited text => approved_with_edits; item version bumped; diff stored; state approved
6. Specialist: **→ delivered**; owner/lead **→ verified** (review capability: lead has work.review; owner does NOT — verify owner cannot); lead **→ closed**

> Tester note: Freelancer (cgo_freelancer) sees only assigned items — no seeded freelancer; add one via /admin/os/<org> Add staff role cgo_freelancer to test (ENG-05).

#### ENG-05 — Assignments, deadlines, freelancer visibility, time logging

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs), lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | Operator adds staff 'free-1@growthos-test.example.com' role cgo_freelancer to Brightside (invite link in console); accept it. |
| Start route / navigation | /app/work/<task id> (lead) |
| Final expected state | Assignment scoping and capacity visible on /admin/os Capacity. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Remove the freelancer via /admin/os/<org> **Remove**. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/work, /app/work/[id], /app/ops · saveWorkItem, logWorkEvent, addStaff · CosWorkEvent time/comment |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Save form: Assignee 'free-1', Due tomorrow, Estimated minutes 90 => saved; Activity shows the edit
2. Sign in as free-1 => /app/work lists only the assigned item; opening another item id => 404; sidebar has 'My queue' (work.execute)
3. free-1: **Log time** 30 minutes and **Post** an internal comment => events appear; **→ in_progress** allowed; **→ internal_qa** allowed; **→ client_review** not offered (no review)
4. Lead: set Due to yesterday => /admin/os Exceptions lists it under Overdue

#### ENG-06 — Revision request and rejection

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed), specialist@growthos-demo.example.com (cgo_specialist, seed) |
| Preconditions and test data | An item in client_review. |
| Start route / navigation | /app/approvals |
| Final expected state | Decision log shows reject → approve → revoke. |
| Observable evidence | Decision log screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/approvals · decide, revoke · CosApproval rejected/revoked |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Click **Reject** with an empty Reason => refused; with Reason 'Tone too salesy' => item → revision_requested; staff notified 'revision_requested'
2. As specialist: item shows the reason; **→ in_progress** → **→ internal_qa** → lead **→ client_review** => a NEW approval request (old one rejected stays in the Decision log)
3. Owner: **Approve**; then **Revoke** with reason 'Found an error' => approval revoked; item → revision_requested

#### ENG-07 — Edit after approval voids the approval (work item)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) |
| Preconditions and test data | An approved task/milestone (ENG-04). |
| Start route / navigation | /app/work/<id> |
| Final expected state | Approvals bind to (version, contentHash). |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-AI-08 · /app/work/[id] · saveWorkItem (editWorkItem) · CosWorkItem version; CosApproval revoked |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Change the Title and **Save** => item drops to internal_qa; version +1; Approvals section shows the previous approval as revoked ('Content changed after request.')
2. Change only 'Estimated minutes' (internal) and save => NO revocation (not part of the content hash) — verify
3. Try **→ delivered** from internal_qa => not offered; must go through client_review again

#### ENG-08 — Recurring cycles: generation, idempotency, pause

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser + background job · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | Brightside monthly engagement; scheduler loop running (SETUP-04). Seed already generated this month's cycle. |
| Start route / navigation | /app/engagement/<id> → Recurring delivery |
| Final expected state | Cycle once per period; pause skips generation only. |
| Observable evidence | Work list counts; commercial records; History hold events. |
| Negative / alternate path | SET-10 |
| Cleanup | Hold none. |
| External access / cost / publication | Scheduler |
| Requirement IDs · route/action · resulting state | C-REL-06 · /app/engagement/[id] · cycleGenerate, engagementHold, tickEngagements · CosCycle open/skipped; CosCommercialRecord recurring |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Click **Create this period's work now** => message that this period already exists (no duplicate items); /app/work count unchanged
2. Technical: in the local DB, delete this month's CosCycle row for the engagement (or set the engagement startsAt so a new period is due); wait one tick => exactly one cycle with recurring items ('Next calendar', 'Performance review' for social) and one CosCommercialRecord kind recurring; staff notification cycle_generated
3. Run the tick 3 more times => still one cycle for the period
4. Set Hold 'Paused' with reason 'Client holiday' (**Set**) => hold event; delete the cycle row again and tick => cycle row created with status 'skipped', ZERO work items, no recurring fee
5. Set Hold 'None' => resume; tick => the skipped period is NOT regenerated (unique periodStart) — record as behaviour B-ENG-1
6. As owner: try to set Hold => not offered (staff only)

> Tester note: Pause does NOT stop scheduled publications, AI use, editing or approvals (see SET-10). Owner decision required.

#### ENG-09 — Renewal reminders

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Background job · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) and owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | ENG-02 set Renewal date within renewalNoticeDays (30). Scheduler running. |
| Start route / navigation | Wait one tick |
| Final expected state | One reminder per day per side. |
| Observable evidence | Notification lists. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Scheduler |
| Requirement IDs · route/action · resulting state | C-REL-04 · /app/dashboard, /app/ops · tickEngagements · CosNotification renewal_due |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. After the tick, as lead /app/ops → Needs attention shows a 'renewal_due' notice; as owner /app/dashboard Updates shows one too
2. Run 5 more ticks => no duplicate notices (deduped per engagement per day)
3. Set Renewal date to 90 days ahead => no new notice

> Tester note: renewalMode auto/manual is informational; nothing auto-renews (record as behaviour).

#### ENG-10 — Two engagements in one workspace

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs), lead@growthos-demo.example.com (cgo_lead, seed), owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside has one engagement. |
| Start route / navigation | /admin/os/<brightside id> → New engagement |
| Final expected state | Items, contracts and cycles stay attached to their engagement. |
| Observable evidence | Engagement list; export JSON. |
| Negative / alternate path | — |
| Cleanup | Keep for SET-11 (handover with another engagement open). |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /admin/os/[orgId], /app/engagement · newEngagement, proposeContract, roadmapStart · CosEngagement x2 |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Name 'Website refresh 2027', goals product, readiness foundation_needed => created; /app/engagement now lists two (no auto-redirect)
2. Propose scope with Kind 'Project', service 'website', engagementId = the new one; owner signs => the new engagement moves to accepted/onboarding; the first stays active
3. Lead: create the website delivery plan on engagement 2 => project appears; /app/work shows items from both, each linked to its engagement
4. Create a campaign on /app/content with 'Goal' from engagement 1; open engagement 2 => its roadmap does not list engagement-1 items
5. Export (/api/os/export) => both engagements present with their own contracts

> Tester note: Covered automatically by release-journeys F.

#### ENG-11 — Blocked work, unblocking, failed state

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed), lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | A task in_progress. |
| Start route / navigation | /app/work/<id> |
| Final expected state | Blocked/unblocked round trip. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/work/[id] · moveWorkItem, dependencyAdd · CosWorkItem blocked; CosDependency |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. **→ blocked** with note => state blocked; stateBefore stored; staff 'blocked' notification; /admin/os Exceptions counts it
2. Only the return to the previous state is offered => **→ in_progress**
3. Dependency panel: **Add dependency** on another open item => item cannot start; deliver the other item => 'unblocked' notification and the item returns to stateBefore

#### ENG-12 — Cancellation of work and engagement decline reason

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | Any open item. |
| Start route / navigation | /app/work/<id> |
| Final expected state | Terminal state respected. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/work/[id] · moveWorkItem · cancelled |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. **→ cancelled** => confirm dialog; state cancelled (terminal); no further buttons
2. Open the closed item => Activity intact

#### ENG-13 — Growth Audit findings → work, baselines insert-only

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed), owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | A workspace provisioned from a delivered audit lead (OPS-02 optional) or Brightside with attached audit (operator **Attach** a delivered audit). |
| Start route / navigation | /app/audit |
| Final expected state | Finding → work traceability; baselines append-only. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/audit · findingMove, findingToWork, approveBaseline · CosFinding accepted; CosBaseline v2 |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Lead: on a finding click **Evidence checked** with label 'verified' => state; **Propose to client** => proposed
2. Owner: **Accept** => accepted; Lead: **Create work item** with Service + Success measure => 'View work item →' link; the item lists the finding as 'Why this work exists'
3. Lead: **Record baseline** (confirm 'Baselines are permanent…') => v1; record again with Reason for correction => v2 supersedes v1; v1 still visible (insert-only)
4. Owner tries **Propose to client** => not offered (client can only accept/defer/reject)

> Tester note: Skip if no audit is attached; mark Blocked with reason.

#### ENG-14 — Growth Plan (AI CMO) draft, submit, decide, ±5pt rule

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed), owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside; stand-in model. |
| Start route / navigation | /app/strategy |
| Final expected state | Approved plan versions immutable. |
| Observable evidence | Plan cards. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Real model for a meaningful plan |
| Requirement IDs · route/action · resulting state | C-PAYER-02 · /app/strategy · draftPlan, submitPlan, decidePlan · CosPlan approved/superseded |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Lead: **Draft plan** with constraints 'no paid ads' => plan v1 draft (stand-in returns a test payload; validator may reject — record); **Send to client** => in_review
2. Owner: **Approve plan** => approved; Lead drafts v2 and sends; Owner approves => v1 superseded
3. If v2 moves any allocation by ≥5 points, the approval requires the OWNER role specifically (admin cannot) — verify by making an admin member (AUTH-13 change analyst to admin) attempt it
4. Owner **Reject** without note => allowed? (record) — reason is expected

> Tester note: AI is metered as catalyst_internal (never debits the client) — verify on /app/settings/ai-credits that balance is unchanged after drafting.

#### ENG-15 — Learning store

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | Brightside. |
| Start route / navigation | /app/strategy → Learning store |
| Final expected state | Only approved learnings feed plans. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/strategy · proposeLearning, reviewLearning · CosLearning approved |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. **Propose learning**: Hypothesis, Result, Segment, Window, Method, Counts, Uncertainty => proposed
2. As lead (work.review) **Approve** => approved; as owner the Approve/Reject buttons are absent

#### ENG-16 — Reports notes: draft, publish immutable

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed), owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside with metrics. |
| Start route / navigation | /app/reports/notes |
| Final expected state | Published CosReport immutable. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-ANL-05 · /app/reports/notes · draftReport, publishReport · CosReport published |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. **Generate draft** Kind 'Monthly note', Period this month => metric table + narrative (stand-in '[TEST NARRATIVE]'); Limitations shown
2. Edit Narrative to include 'guaranteed 300% growth' and **Publish to client** => refused by copyProblems (banned claim)
3. Publish with a plain narrative => confirm dialog 'Published reports are immutable'; published; **Generate draft** for the same period again => new draft does not alter the published one
4. Owner opens /app/reports/notes => published report visible; no publish controls

> Tester note: Narrative numbers not present in facts are discarded (ANL-08).

#### ENG-17 — Search and Ads studios: briefs, tier-3 spend proposal, manual metric

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed), owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Workspace with seo and paid-ads in scope (sign an add-on on Brightside or use C). |
| Start route / navigation | /app/search and /app/ads |
| Final expected state | Tier-3 always needs a named owner approval. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/search, /app/ads · newSeoBrief, recordMetric, newWorkItem · CosWorkItem riskTier 3 |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Search: **Draft brief** Target keyword 'dental implants pune' => content work item service seo (stand-in draft)
2. Search: **Record** Metric clicks, Day today, Value 12, grade B => tile updates with grade
3. Ads: **Create proposal** 'Increase budget', 'Rationale & hard cap' 'cap ₹20,000/mo' => a tier-3 paid-ads task; move it to client_review => owner approval required with spend.approve; as admin member attempt => 'Spend, releases and paid scope changes need a workspace owner.'
4. Owner approves => item approved; move **→ scheduled**/delivered passes gateAction only with a current approval


### F. Content

#### CONT-01 — Campaign creation and brief

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | Brightside. |
| Start route / navigation | /app/content → Campaigns tab → New campaign |
| Final expected state | CosCampaign with revision 1; link to LosCampaign. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/content, /app/content/campaigns/[id] · campaignCreate, campaignUpdate, captureFormLink · CosCampaign draft/active |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Name '' => refused; Name 'Aligner autumn', Goal 'Booked consultations', Objective, 'Where links should lead' 'http://x' => refused (https); use 'https://example.com/aligners', Channels linkedin + instagram, Traffic Organic, **Create campaign** => redirected to /app/content/campaigns/<id>; a stable link tag (utm_campaign code) shown
2. Edit the brief (Audience, Key message) and **Save brief** => saved; code unchanged
3. Set Status 'paused' then 'active' => saved; try an unknown status via devtools => refused
4. **Link form** select the seeded 'Book a consult (demo form)' => linked; 'Lead-capture forms for this campaign' lists it

> Tester note: campaignUpdate flags open variants when the brief changes (CONT-06).

#### CONT-02 — Master piece with sources and claims

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | CONT-01. |
| Start route / navigation | /app/content → New master piece |
| Final expected state | Master (CosWorkItem type content, payload.kind master) in backlog/draft. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/content/[id] · masterCreate, saveWorkItem · CosWorkItem content |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Title 'Why aligners beat braces for adults', Campaign 'Aligner autumn', Brief text => **Create and add versions** => /app/content/<id>
2. In 'Sources and approved claims' attach the approved claim and a source => listed; try to attach the retired claim => not offered
3. Enter Core copy containing 'guaranteed results' and **Save master** => allowed at master level? Expected: saved (validators run on variants/AI drafts) — record actual

#### CONT-03 — Channel variants: create, validate limits, media

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) |
| Preconditions and test data | CONT-02; an image asset approved (AST-01) and a video asset uploaded (AST-02). |
| Start route / navigation | /app/content/<master id> → Add a channel version |
| Final expected state | Variants in draft with deterministic validation messages. |
| Observable evidence | Screenshots of each problem/warning. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-AI-07 · /app/content/[id] · variantCreate, variantEdit · CosContentVariant draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Select 'x:post', body of 300 characters => **Add version** creates it but the card shows problem 'over 280' (URLs count 23) => cannot pass QA until fixed
2. Edit to 250 chars with a link => problem clears; warning about link? (x allows links) none
3. Add 'instagram:post' with a link in the caption => warning 'links are not clickable'; without media => problem 'needs 1 image' until you tick an image under 'Media from Assets'
4. Add 'youtube:short' with only a script => problem 'needs a finished video file from Assets — a script or storyboard is not a video'; attach the uploaded MP4 => clears; Title required ≤100
5. Add 'linkedin:document' => requires a PDF/DOCX/PPTX asset (document kind) and a Title
6. Add 'x:thread' with 1 part => problem (2–25 parts); add 3 parts
7. Duplicate the same x:post copy on a second variant => warning 'Same copy already exists on this channel'

> Tester note: Formats and limits: lib/os/channels.ts. Video formats never accept text as a video.

#### CONT-04 — Editorial flow: QA → client review → approval; client cannot skip

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed), lead@growthos-demo.example.com (cgo_lead, seed), owner@growthos-demo.example.com (owner, seed), analyst-a@growthos-test.example.com (analyst, invited in AUTH-05) |
| Preconditions and test data | A valid x:post variant in draft. |
| Start route / navigation | /app/content/<master id> |
| Final expected state | Approved variant v1. |
| Observable evidence | Screenshots; Decision log. |
| Negative / alternate path | CONT-05 |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-AI-08 · /app/content/[id], /app/approvals · variantMove, decide · CosContentVariant approved; CosApproval variant |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Specialist: **Send to internal QA** => internal_qa; specialist tries **Pass QA → client review** => refused (needs work.review/manage)
2. Owner tries to move a draft variant to client_review via devtools => refused (client cannot move variants)
3. Lead: **Pass QA → client review** => client_review; owner's Approvals badge +1; approval request expires in 14 days
4. Analyst opens /app/approvals => 'Waiting for a client approver.' (analyst lacks approvals.decide)
5. Owner: **Review and decide** → **Approve** => variant approved; approval bound to version/hash
6. Lead: try **Pass QA** on a variant with sourceChanged=true => refused until **Reviewed against the new source**

#### CONT-05 — Edit invalidates THAT variant's approval and cancels its schedule

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) |
| Preconditions and test data | CONT-04 approved variant, and a second approved variant on the same master; schedule the first (CAL-01). |
| Start route / navigation | /app/content/<master id> |
| Final expected state | Material fields: title, body, parts, CTA, destination, media. |
| Observable evidence | Screenshots; publication row status cancelled. |
| Negative / alternate path | — |
| Cleanup | Re-QA and re-approve one variant for publishing tests. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-AI-08, C-JRN-01 · /app/content/[id] · variantEdit · version+1; CosApproval revoked; CosPublication cancelled |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Change one word of the first variant's Copy and **Save version** => confirm dialog 'withdraws that approval and cancels its schedule'; accept => new version; state internal_qa; approval revoked; publication cancelled
2. Second variant => still approved (per-variant invalidation)
3. Change only the Call to action on the second => also revoked (CTA is material); change nothing and save => no new version

> Tester note: Even if a scheduled row survived, publish-time revalidation would refuse on version/hash mismatch.

#### CONT-06 — Client rejection with comments; internal vs client-visible comments

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed), specialist@growthos-demo.example.com (cgo_specialist, seed) |
| Preconditions and test data | Seed: x:thread variant rejected 'remove prices from social' with one internal and one client comment. |
| Start route / navigation | /app/content/<seed master id> |
| Final expected state | Internal notes never reach the client. |
| Observable evidence | Two screenshots (owner vs staff). |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/content/[id] · variantComment · CosWorkEvent internal |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. As owner: the rejected thread shows the client-visible comment only; the internal note is absent
2. As specialist: both comments visible; add **Comment** with 'Internal note' ticked => owner reload → not visible
3. Specialist edits the thread (removes prices), re-QA, lead passes, owner **Approve** => approved

#### CONT-07 — Approve with edits keeps the reviewed final version

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | A variant in client_review. |
| Start route / navigation | /app/approvals |
| Final expected state | approved_with_edits recorded. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/approvals · decide (approved_with_edits) · CosRevision |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Click **Approve with edits**, change one sentence, **Approve this version** => variant body updated, version bumped, state approved, diff stored (details 'What changed since v1')
2. Open the variant => the edited text is what will publish

#### CONT-08 — Bulk move and calendar filters

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | Several draft variants. |
| Start route / navigation | /app/content |
| Final expected state | Bulk partial failures are reported, not hidden. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/content · variantBulk · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Not scheduled yet' list: tick two variants, Move to 'Internal QA', **Move selected** => both move; tick one invalid (over-limit) and move to 'Client review' => partial failure message naming the failed one
2. Filters: Campaign, Channel, Owner, Status → **Apply** => grid narrows; **Clear** resets; **← Earlier / Today / Later →** shift by 14 days

#### CONT-09 — AI drafts for variants and calendar (internal, never charged to client)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | Stand-in model; note the client balance. |
| Start route / navigation | /app/content/<master id> |
| Final expected state | Staff AI paths are catalyst_internal. |
| Observable evidence | Credits console screenshot. |
| Negative / alternate path | — |
| Cleanup | Cancel generated items if noisy. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-PAYER-02 · /app/content, /app/content/[id] · variantsAiDraft, fillCalendar · CosAiUsage payer catalyst_internal |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. **Draft versions with AI** targets linkedin:post + x:post, instruction 'short' => two draft variants labelled AI-drafted with '[TEST DRAFT]'; flags posted as internal comment
2. /app/content → **Generate draft ideas** channels x, linkedin => up to 40 master items in backlog (stand-in returns 5)
3. /app/settings/ai-credits (owner) => balance unchanged; /admin/os/credits → 'AI consumption — who paid' shows catalyst_internal rows

> Tester note: With no LLM key configured the buttons show 'AI is not configured'.

#### CONT-10 — Lead-capture campaign builder (LeadOS) and review gate

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed), Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | Brightside (crm module). |
| Start route / navigation | /app/campaigns → New campaign |
| Final expected state | LosCampaign active with a versioned spec. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Pause the campaign. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/campaigns/[id], /admin/leados/reviews · createCampaign, saveCampaignSection, submitCampaignForReview, launchCampaign, decideReview · LosCampaign draft→in_review→approved→active |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Dialog: Campaign name 'Spring offer', How will leads arrive 'form', Objective => **Create draft** => /app/campaigns/<id> with tabs 1–5
2. Offer tab fill and **Save offer**; Lead form tab: add a field named 'Aadhaar number' => refused/flagged as sensitive; add 'Budget' select; Landing page: Headline, Button text; Follow-up: Round robin, select owner; **Submit for review** => 'In review'; problems list shows ✕ errors if consent purposes missing
3. Operator /admin/leados/reviews → **Approve** => campaign approved; owner **Launch campaign** => active; Public page URL + embed snippet shown
4. **Pause** then **Resume campaign** => statuses; add a tracking link => 6-char code


### F. Content · Scheduling

#### CAL-01 — Schedule in workspace timezone; publish once via test adapter

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser + background job · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) |
| Preconditions and test data | Approved x:post variant (CONT-04); test connection exists (seed); scheduler running; workspace tz Asia/Kolkata. |
| Start route / navigation | /app/content/<master id> → Publishing |
| Final expected state | Published once; audit variant.published. |
| Observable evidence | Attempt log; tick output. |
| Negative / alternate path | CAL-02, PUB-03 |
| Cleanup | None. |
| External access / cost / publication | Scheduler |
| Requirement IDs · route/action · resulting state | C-JRN-03 · /app/content/[id] · publicationSchedule, runDuePublications · CosPublication scheduled→claimed→published |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Publish to' select the 'Test account (always succeeds)'; 'Publish at (Asia/Kolkata)' = now + 2 minutes; **Schedule** => variant scheduled; calendar grid shows it on today's cell at HH:mm IST
2. Try to schedule the same variant again => refused (one live publication per version)
3. Enter a past time => refused
4. Wait for the tick => variant published; card shows 'TEST account — not a real post', external link, exactly one attempt 'success' in the attempt log
5. Run 3 more ticks => still one attempt; master shows delivered once all variants are published/cancelled

> Tester note: The test adapter exists only with GROWTHOS_TEST_ADAPTER=1 outside production.

#### CAL-02 — Cancel, reschedule, disconnect effects

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) |
| Preconditions and test data | Another approved variant. |
| Start route / navigation | /app/content/<master id> |
| Final expected state | Cancel only works on 'scheduled' rows (never a claimed one). |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/content/[id], /app/settings/workspace · publicationCancel, accountDisconnect · CosPublication cancelled |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Schedule for +1 hour; click **Cancel** => 'Cancelled. The variant stays approved.'; variant approved, scheduledAt cleared
2. Schedule again for +1 hour; there is no Reschedule button (publicationReschedule action has no UI — gap G-CAL-1); reschedule = Cancel + Schedule
3. Settings → Workspace → AccountsPanel: **Disconnect** the test account => scheduled publication cancelled with 'The account was disconnected.'; variant back to approved
4. Re-add the test account

#### CAL-03 — Workspace timezone change and DST boundaries

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed), specialist@growthos-demo.example.com (cgo_specialist, seed) |
| Preconditions and test data | Northwind (Europe/Berlin) with an approved variant and test account; or set Brightside tz to Europe/London. |
| Start route / navigation | /app/settings/workspace → AccountsPanel timezone |
| Final expected state | DST resolved explicitly, note stored in the work event. |
| Observable evidence | Screenshots of both notices. |
| Negative / alternate path | — |
| Cleanup | Cancel the far-future schedules; restore timezone. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/content/[id] · workspaceTime, publicationSchedule (zonedToUtc) · CosWorkEvent data.dst |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Owner sets timezone 'Europe/London' (**Save**) => 'Scheduled times keep their instant; they are shown in the new zone.'; existing scheduled item shows a different wall time, same instant
2. Enter timezone 'Mars/Olympus' => refused 'Unknown time zone'
3. Specialist schedules at 2027-03-28 01:30 (spring-forward gap in London) => message 'That time does not exist… moved to the next valid time'; stored instant = 01:00 UTC
4. Schedule at 2026-10-25 01:30 (ambiguous) => 'That time happens twice… the first one was used'; stored 00:30 UTC
5. Calendar day labels remain correct across the DST week

> Tester note: Cycle boundaries are plain UTC (day clamped to 28) — separate behaviour.

#### CAL-04 — Calendar view content and 'Not scheduled yet'

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Seed. |
| Start route / navigation | /app/content |
| Final expected state | Read-only calendar for clients. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/content · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Calendar tab => 14-day grid, header 'Times shown in Asia/Kolkata'; published seed post on its day; 'Not scheduled yet (n)' lists drafts/approved
2. Owner sees no **Move selected** for states they cannot set? (record actual)


### G. AI Studio

#### AI-01 — AI Studio tool: Campaign brief & content ideas (campaign_brief)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside signed in as owner; stand-in model (dev-verify) so drafts are labelled [TEST DRAFT]; note the Available balance on /app/settings/ai-credits first. |
| Start route / navigation | /app/studio → card 'Campaign brief & content ideas' (group Plan) → /app/studio/campaign_brief |
| Final expected state | CosAiOperation completed; CosAiUsage payer client_wallet; draft saved to the correct destination. |
| Observable evidence | History page screenshot; transactions row; content draft. |
| Negative / alternate path | AIX-01..AIX-12 |
| Cleanup | Cancel the created drafts if noisy. |
| External access / cost / publication | Real model key on staging (check 1) |
| Requirement IDs · route/action · resulting state | C-AI-02, C-AI-03, C-AI-04, C-AI-05 · /app/studio/campaign_brief, /app/studio/history/[id] · studioQuote, studioRun, studioSave · CosCreditQuote→CosAiOperation completed→CosWorkItem/CosContentVariant draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Card visible and enabled in AI Studio (entitled by the seed contract) => opening the page shows the purpose text, 'What you get' note and 'Typical maximum: a–b credits'
2. Required inputs: 'What the campaign should achieve' — submit **Get quote** with them empty => inline validation, no quote created
3. Fill: 'What the campaign should achieve'; optional: 'Who it is for', 'Offer', 'Anything it must include or avoid'; Output limit 'Standard'; the 'Search the web and cite sources' checkbox is HIDDEN locally (no BRAVE_SEARCH_API_KEY); pick 'Sources to draw on' if offered => click **Get quote** => 'Quote: at most N credits (M available)… Valid until <time>' + ' TEST PRICES — synthetic rate card.'; button 'Run — up to N credits'
4. Change one input after the quote => 'You changed the inputs — get a new quote.' and the Run button disappears
5. Get a new quote and click **Run** => redirected to /app/studio/history/<id>; status queued/running with 'Up to N credits are held, not spent.'; page auto-refreshes; then 'Charged X of a maximum N credits.'
6. Result: a brief with headings Objective / Audience / Key message / Offer / Channels / Measures and idea list ; 'Check before using:' flags listed if any
7. Save form: **Save as a draft campaign** (see AIX-13) — no content-draft save for this tool
8. /app/settings/ai-credits → Transactions => one 'AI run' debit equal to the charged amount; 'Your AI runs' lists the operation with tool, member, credits; Available decreased by exactly that amount

> Tester note: Destination is a DRAFT CosCampaign via saveBriefAsCampaign (AIX-13). Usefulness criteria with a REAL model (staging): output addresses the topic and audience, respects 'Anything it must include or avoid', contains no banned claims, no placeholder text, no invented figures (flagged if not in sources). Wording need not match between runs.

#### AI-02 — AI Studio tool: Content calendar (content_calendar)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside signed in as owner; stand-in model (dev-verify) so drafts are labelled [TEST DRAFT]; note the Available balance on /app/settings/ai-credits first. |
| Start route / navigation | /app/studio → card 'Content calendar' (group Plan) → /app/studio/content_calendar |
| Final expected state | CosAiOperation completed; CosAiUsage payer client_wallet; draft saved to the correct destination. |
| Observable evidence | History page screenshot; transactions row; content draft. |
| Negative / alternate path | AIX-01..AIX-12 |
| Cleanup | Cancel the created drafts if noisy. |
| External access / cost / publication | Real model key on staging (check 1) |
| Requirement IDs · route/action · resulting state | C-AI-02, C-AI-03, C-AI-04, C-AI-05 · /app/studio/content_calendar, /app/studio/history/[id] · studioQuote, studioRun, studioSave · CosCreditQuote→CosAiOperation completed→CosWorkItem/CosContentVariant draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Card visible and enabled in AI Studio (entitled by the seed contract) => opening the page shows the purpose text, 'What you get' note and 'Typical maximum: a–b credits'
2. Required inputs: 'Channels (comma separated)' = 'linkedin, x'; 'Days to plan' 14 — submit **Get quote** with them empty => inline validation, no quote created
3. Fill: 'Channels (comma separated)' = 'linkedin, x'; 'Days to plan' 14; optional: notes; Output limit 'Standard'; no research checkbox (tool is not research-capable); pick 'Sources to draw on' if offered => click **Get quote** => 'Quote: at most N credits (M available)… Valid until <time>' + ' TEST PRICES — synthetic rate card.'; button 'Run — up to N credits'
4. Change one input after the quote => 'You changed the inputs — get a new quote.' and the Run button disappears
5. Get a new quote and click **Run** => redirected to /app/studio/history/<id>; status queued/running with 'Up to N credits are held, not spent.'; page auto-refreshes; then 'Charged X of a maximum N credits.'
6. Result: a list of dated items (dayOffset within 0–13, channel linkedin/x) — stand-in returns 5 ; entries with unknown channels or bad offsets are dropped and reported; an empty calendar fails the run without charge; 'Check before using:' flags listed if any
7. Edit the title/body in the save form; 'Also create a channel version' offers only: n/a (calendar saves one master per item); choose one, Campaign 'Consult First', **Save as a content draft(s)** => a master draft (state backlog/draft) plus a channel variant flagged AI-drafted appears in /app/content; saving is NOT an approval (variant is draft)
8. /app/settings/ai-credits → Transactions => one 'AI run' debit equal to the charged amount; 'Your AI runs' lists the operation with tool, member, credits; Available decreased by exactly that amount

> Tester note: Partial output is delivered with flags and charged on actual tokens. Usefulness criteria with a REAL model (staging): output addresses the topic and audience, respects 'Anything it must include or avoid', contains no banned claims, no placeholder text, no invented figures (flagged if not in sources). Wording need not match between runs.

#### AI-03 — AI Studio tool: Blog outline (blog_outline)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside signed in as owner; stand-in model (dev-verify) so drafts are labelled [TEST DRAFT]; note the Available balance on /app/settings/ai-credits first. |
| Start route / navigation | /app/studio → card 'Blog outline' (group Write) → /app/studio/blog_outline |
| Final expected state | CosAiOperation completed; CosAiUsage payer client_wallet; draft saved to the correct destination. |
| Observable evidence | History page screenshot; transactions row; content draft. |
| Negative / alternate path | AIX-01..AIX-12 |
| Cleanup | Cancel the created drafts if noisy. |
| External access / cost / publication | Real model key on staging (check 1) |
| Requirement IDs · route/action · resulting state | C-AI-02, C-AI-03, C-AI-04, C-AI-05 · /app/studio/blog_outline, /app/studio/history/[id] · studioQuote, studioRun, studioSave · CosCreditQuote→CosAiOperation completed→CosWorkItem/CosContentVariant draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Card visible and enabled in AI Studio (entitled by the seed contract) => opening the page shows the purpose text, 'What you get' note and 'Typical maximum: a–b credits'
2. Required inputs: 'Topic or angle' — submit **Get quote** with them empty => inline validation, no quote created
3. Fill: 'Topic or angle'; optional: 'Who it is for', 'Target search phrase', notes; Output limit 'Standard'; the 'Search the web and cite sources' checkbox is HIDDEN locally (no BRAVE_SEARCH_API_KEY); pick 'Sources to draw on' if offered => click **Get quote** => 'Quote: at most N credits (M available)… Valid until <time>' + ' TEST PRICES — synthetic rate card.'; button 'Run — up to N credits'
4. Change one input after the quote => 'You changed the inputs — get a new quote.' and the Run button disappears
5. Get a new quote and click **Run** => redirected to /app/studio/history/<id>; status queued/running with 'Up to N credits are held, not spent.'; page auto-refreshes; then 'Charged X of a maximum N credits.'
6. Result: a titled draft body ; 'Check before using:' flags listed if any
7. Edit the title/body in the save form; 'Also create a channel version' offers only: blog:article; choose one, Campaign 'Consult First', **Save as a content draft(s)** => a master draft (state backlog/draft) plus a channel variant flagged AI-drafted appears in /app/content; saving is NOT an approval (variant is draft)
8. /app/settings/ai-credits → Transactions => one 'AI run' debit equal to the charged amount; 'Your AI runs' lists the operation with tool, member, credits; Available decreased by exactly that amount

> Tester note:  Usefulness criteria with a REAL model (staging): output addresses the topic and audience, respects 'Anything it must include or avoid', contains no banned claims, no placeholder text, no invented figures (flagged if not in sources). Wording need not match between runs.

#### AI-04 — AI Studio tool: Article draft (blog_article)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside signed in as owner; stand-in model (dev-verify) so drafts are labelled [TEST DRAFT]; note the Available balance on /app/settings/ai-credits first. NOTE: Brightside seed does NOT entitle blog_article — first verify 'Unavailable — … ask Catalyst about adding it' and a direct URL redirect; then have the operator propose+sign an add-on with this tool (SCOPE-08 pattern) before running. |
| Start route / navigation | /app/studio → card 'Article draft' (group Write) → /app/studio/blog_article |
| Final expected state | CosAiOperation completed; CosAiUsage payer client_wallet; draft saved to the correct destination. |
| Observable evidence | History page screenshot; transactions row; content draft. |
| Negative / alternate path | AIX-01..AIX-12 |
| Cleanup | Cancel the created drafts if noisy. |
| External access / cost / publication | Real model key on staging (check 1) |
| Requirement IDs · route/action · resulting state | C-AI-02, C-AI-03, C-AI-04, C-AI-05 · /app/studio/blog_article, /app/studio/history/[id] · studioQuote, studioRun, studioSave · CosCreditQuote→CosAiOperation completed→CosWorkItem/CosContentVariant draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Card visible and enabled in AI Studio (entitled by the seed contract) => opening the page shows the purpose text, 'What you get' note and 'Typical maximum: a–b credits'
2. Required inputs: 'Topic or angle' — submit **Get quote** with them empty => inline validation, no quote created
3. Fill: 'Topic or angle'; optional: 'Outline (optional)', audience, CTA, notes; Output limit 'Standard'; the 'Search the web and cite sources' checkbox is HIDDEN locally (no BRAVE_SEARCH_API_KEY); pick 'Sources to draw on' if offered => click **Get quote** => 'Quote: at most N credits (M available)… Valid until <time>' + ' TEST PRICES — synthetic rate card.'; button 'Run — up to N credits'
4. Change one input after the quote => 'You changed the inputs — get a new quote.' and the Run button disappears
5. Get a new quote and click **Run** => redirected to /app/studio/history/<id>; status queued/running with 'Up to N credits are held, not spent.'; page auto-refreshes; then 'Charged X of a maximum N credits.'
6. Result: a titled draft body ; 'Check before using:' flags listed if any
7. Edit the title/body in the save form; 'Also create a channel version' offers only: blog:article; choose one, Campaign 'Consult First', **Save as a content draft(s)** => a master draft (state backlog/draft) plus a channel variant flagged AI-drafted appears in /app/content; saving is NOT an approval (variant is draft)
8. /app/settings/ai-credits → Transactions => one 'AI run' debit equal to the charged amount; 'Your AI runs' lists the operation with tool, member, credits; Available decreased by exactly that amount

> Tester note: This tool doubles as the entitlement negative (SCOPE-06). Usefulness criteria with a REAL model (staging): output addresses the topic and audience, respects 'Anything it must include or avoid', contains no banned claims, no placeholder text, no invented figures (flagged if not in sources). Wording need not match between runs.

#### AI-05 — AI Studio tool: Website / landing-page copy (web_copy)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside signed in as owner; stand-in model (dev-verify) so drafts are labelled [TEST DRAFT]; note the Available balance on /app/settings/ai-credits first. |
| Start route / navigation | /app/studio → card 'Website / landing-page copy' (group Write) → /app/studio/web_copy |
| Final expected state | CosAiOperation completed; CosAiUsage payer client_wallet; draft saved to the correct destination. |
| Observable evidence | History page screenshot; transactions row; content draft. |
| Negative / alternate path | AIX-01..AIX-12 |
| Cleanup | Cancel the created drafts if noisy. |
| External access / cost / publication | Real model key on staging (check 1) |
| Requirement IDs · route/action · resulting state | C-AI-02, C-AI-03, C-AI-04, C-AI-05 · /app/studio/web_copy, /app/studio/history/[id] · studioQuote, studioRun, studioSave · CosCreditQuote→CosAiOperation completed→CosWorkItem/CosContentVariant draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Card visible and enabled in AI Studio (entitled by the seed contract) => opening the page shows the purpose text, 'What you get' note and 'Typical maximum: a–b credits'
2. Required inputs: 'Which page and its one job' — submit **Get quote** with them empty => inline validation, no quote created
3. Fill: 'Which page and its one job'; optional: audience, 'Offer', CTA, notes; Output limit 'Standard'; the 'Search the web and cite sources' checkbox is HIDDEN locally (no BRAVE_SEARCH_API_KEY); pick 'Sources to draw on' if offered => click **Get quote** => 'Quote: at most N credits (M available)… Valid until <time>' + ' TEST PRICES — synthetic rate card.'; button 'Run — up to N credits'
4. Change one input after the quote => 'You changed the inputs — get a new quote.' and the Run button disappears
5. Get a new quote and click **Run** => redirected to /app/studio/history/<id>; status queued/running with 'Up to N credits are held, not spent.'; page auto-refreshes; then 'Charged X of a maximum N credits.'
6. Result: a titled draft body ; 'Check before using:' flags listed if any
7. Save as a master draft only (no channel version offered)
8. /app/settings/ai-credits → Transactions => one 'AI run' debit equal to the charged amount; 'Your AI runs' lists the operation with tool, member, credits; Available decreased by exactly that amount

> Tester note:  Usefulness criteria with a REAL model (staging): output addresses the topic and audience, respects 'Anything it must include or avoid', contains no banned claims, no placeholder text, no invented figures (flagged if not in sources). Wording need not match between runs.

#### AI-06 — AI Studio tool: LinkedIn post (linkedin_post)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside signed in as owner; stand-in model (dev-verify) so drafts are labelled [TEST DRAFT]; note the Available balance on /app/settings/ai-credits first. |
| Start route / navigation | /app/studio → card 'LinkedIn post' (group Social) → /app/studio/linkedin_post |
| Final expected state | CosAiOperation completed; CosAiUsage payer client_wallet; draft saved to the correct destination. |
| Observable evidence | History page screenshot; transactions row; content draft. |
| Negative / alternate path | AIX-01..AIX-12 |
| Cleanup | Cancel the created drafts if noisy. |
| External access / cost / publication | Real model key on staging (check 1) |
| Requirement IDs · route/action · resulting state | C-AI-02, C-AI-03, C-AI-04, C-AI-05 · /app/studio/linkedin_post, /app/studio/history/[id] · studioQuote, studioRun, studioSave · CosCreditQuote→CosAiOperation completed→CosWorkItem/CosContentVariant draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Card visible and enabled in AI Studio (entitled by the seed contract) => opening the page shows the purpose text, 'What you get' note and 'Typical maximum: a–b credits'
2. Required inputs: 'Topic or angle' — submit **Get quote** with them empty => inline validation, no quote created
3. Fill: 'Topic or angle'; optional: audience, CTA, notes; Output limit 'Standard'; no research checkbox (tool is not research-capable); pick 'Sources to draw on' if offered => click **Get quote** => 'Quote: at most N credits (M available)… Valid until <time>' + ' TEST PRICES — synthetic rate card.'; button 'Run — up to N credits'
4. Change one input after the quote => 'You changed the inputs — get a new quote.' and the Run button disappears
5. Get a new quote and click **Run** => redirected to /app/studio/history/<id>; status queued/running with 'Up to N credits are held, not spent.'; page auto-refreshes; then 'Charged X of a maximum N credits.'
6. Result: a titled draft body ; 'Check before using:' flags listed if any
7. Edit the title/body in the save form; 'Also create a channel version' offers only: linkedin:post; choose one, Campaign 'Consult First', **Save as a content draft(s)** => a master draft (state backlog/draft) plus a channel variant flagged AI-drafted appears in /app/content; saving is NOT an approval (variant is draft)
8. /app/settings/ai-credits → Transactions => one 'AI run' debit equal to the charged amount; 'Your AI runs' lists the operation with tool, member, credits; Available decreased by exactly that amount

> Tester note:  Usefulness criteria with a REAL model (staging): output addresses the topic and audience, respects 'Anything it must include or avoid', contains no banned claims, no placeholder text, no invented figures (flagged if not in sources). Wording need not match between runs.

#### AI-07 — AI Studio tool: LinkedIn document carousel copy (linkedin_carousel)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside signed in as owner; stand-in model (dev-verify) so drafts are labelled [TEST DRAFT]; note the Available balance on /app/settings/ai-credits first. |
| Start route / navigation | /app/studio → card 'LinkedIn document carousel copy' (group Social) → /app/studio/linkedin_carousel |
| Final expected state | CosAiOperation completed; CosAiUsage payer client_wallet; draft saved to the correct destination. |
| Observable evidence | History page screenshot; transactions row; content draft. |
| Negative / alternate path | AIX-01..AIX-12 |
| Cleanup | Cancel the created drafts if noisy. |
| External access / cost / publication | Real model key on staging (check 1) |
| Requirement IDs · route/action · resulting state | C-AI-02, C-AI-03, C-AI-04, C-AI-05 · /app/studio/linkedin_carousel, /app/studio/history/[id] · studioQuote, studioRun, studioSave · CosCreditQuote→CosAiOperation completed→CosWorkItem/CosContentVariant draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Card visible and enabled in AI Studio (entitled by the seed contract) => opening the page shows the purpose text, 'What you get' note (handoff: 'copy only — a person designs and uploads the document') and 'Typical maximum: a–b credits'
2. Required inputs: 'Topic or angle'; 'Slides' 8 — submit **Get quote** with them empty => inline validation, no quote created
3. Fill: 'Topic or angle'; 'Slides' 8; optional: audience, CTA, notes; Output limit 'Standard'; no research checkbox (tool is not research-capable); pick 'Sources to draw on' if offered => click **Get quote** => 'Quote: at most N credits (M available)… Valid until <time>' + ' TEST PRICES — synthetic rate card.'; button 'Run — up to N credits'
4. Change one input after the quote => 'You changed the inputs — get a new quote.' and the Run button disappears
5. Get a new quote and click **Run** => redirected to /app/studio/history/<id>; status queued/running with 'Up to N credits are held, not spent.'; page auto-refreshes; then 'Charged X of a maximum N credits.'
6. Result: a titled draft body ; 'Check before using:' flags listed if any
7. Edit the title/body in the save form; 'Also create a channel version' offers only: linkedin:document, linkedin:post; choose one, Campaign 'Consult First', **Save as a content draft(s)** => a master draft (state backlog/draft) plus a channel variant flagged AI-drafted appears in /app/content; saving is NOT an approval (variant is draft)
8. /app/settings/ai-credits → Transactions => one 'AI run' debit equal to the charged amount; 'Your AI runs' lists the operation with tool, member, credits; Available decreased by exactly that amount

> Tester note: Verify the page NEVER claims to produce a document/PDF. Saving as linkedin:document creates a variant that still needs a document asset before it can pass QA. Usefulness criteria with a REAL model (staging): output addresses the topic and audience, respects 'Anything it must include or avoid', contains no banned claims, no placeholder text, no invented figures (flagged if not in sources). Wording need not match between runs.

#### AI-08 — AI Studio tool: X post (x_post)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside signed in as owner; stand-in model (dev-verify) so drafts are labelled [TEST DRAFT]; note the Available balance on /app/settings/ai-credits first. |
| Start route / navigation | /app/studio → card 'X post' (group Social) → /app/studio/x_post |
| Final expected state | CosAiOperation completed; CosAiUsage payer client_wallet; draft saved to the correct destination. |
| Observable evidence | History page screenshot; transactions row; content draft. |
| Negative / alternate path | AIX-01..AIX-12 |
| Cleanup | Cancel the created drafts if noisy. |
| External access / cost / publication | Real model key on staging (check 1) |
| Requirement IDs · route/action · resulting state | C-AI-02, C-AI-03, C-AI-04, C-AI-05 · /app/studio/x_post, /app/studio/history/[id] · studioQuote, studioRun, studioSave · CosCreditQuote→CosAiOperation completed→CosWorkItem/CosContentVariant draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Card visible and enabled in AI Studio (entitled by the seed contract) => opening the page shows the purpose text, 'What you get' note and 'Typical maximum: a–b credits'
2. Required inputs: 'Topic or angle' — submit **Get quote** with them empty => inline validation, no quote created
3. Fill: 'Topic or angle'; optional: CTA, notes; Output limit 'Standard'; no research checkbox (tool is not research-capable); pick 'Sources to draw on' if offered => click **Get quote** => 'Quote: at most N credits (M available)… Valid until <time>' + ' TEST PRICES — synthetic rate card.'; button 'Run — up to N credits'
4. Change one input after the quote => 'You changed the inputs — get a new quote.' and the Run button disappears
5. Get a new quote and click **Run** => redirected to /app/studio/history/<id>; status queued/running with 'Up to N credits are held, not spent.'; page auto-refreshes; then 'Charged X of a maximum N credits.'
6. Result: a titled draft body ; body ≤ 280 chars (URLs count 23) or the variant shows a limit problem after save; 'Check before using:' flags listed if any
7. Edit the title/body in the save form; 'Also create a channel version' offers only: x:post; choose one, Campaign 'Consult First', **Save as a content draft(s)** => a master draft (state backlog/draft) plus a channel variant flagged AI-drafted appears in /app/content; saving is NOT an approval (variant is draft)
8. /app/settings/ai-credits → Transactions => one 'AI run' debit equal to the charged amount; 'Your AI runs' lists the operation with tool, member, credits; Available decreased by exactly that amount

> Tester note:  Usefulness criteria with a REAL model (staging): output addresses the topic and audience, respects 'Anything it must include or avoid', contains no banned claims, no placeholder text, no invented figures (flagged if not in sources). Wording need not match between runs.

#### AI-09 — AI Studio tool: X thread (x_thread)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside signed in as owner; stand-in model (dev-verify) so drafts are labelled [TEST DRAFT]; note the Available balance on /app/settings/ai-credits first. |
| Start route / navigation | /app/studio → card 'X thread' (group Social) → /app/studio/x_thread |
| Final expected state | CosAiOperation completed; CosAiUsage payer client_wallet; draft saved to the correct destination. |
| Observable evidence | History page screenshot; transactions row; content draft. |
| Negative / alternate path | AIX-01..AIX-12 |
| Cleanup | Cancel the created drafts if noisy. |
| External access / cost / publication | Real model key on staging (check 1) |
| Requirement IDs · route/action · resulting state | C-AI-02, C-AI-03, C-AI-04, C-AI-05 · /app/studio/x_thread, /app/studio/history/[id] · studioQuote, studioRun, studioSave · CosCreditQuote→CosAiOperation completed→CosWorkItem/CosContentVariant draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Card visible and enabled in AI Studio (entitled by the seed contract) => opening the page shows the purpose text, 'What you get' note and 'Typical maximum: a–b credits'
2. Required inputs: 'Topic or angle'; 'Posts' 4 — submit **Get quote** with them empty => inline validation, no quote created
3. Fill: 'Topic or angle'; 'Posts' 4; optional: CTA, notes; Output limit 'Standard'; no research checkbox (tool is not research-capable); pick 'Sources to draw on' if offered => click **Get quote** => 'Quote: at most N credits (M available)… Valid until <time>' + ' TEST PRICES — synthetic rate card.'; button 'Run — up to N credits'
4. Change one input after the quote => 'You changed the inputs — get a new quote.' and the Run button disappears
5. Get a new quote and click **Run** => redirected to /app/studio/history/<id>; status queued/running with 'Up to N credits are held, not spent.'; page auto-refreshes; then 'Charged X of a maximum N credits.'
6. Result: 'Parts' list of 4 posts ; each part ≤ 280; 'Check before using:' flags listed if any
7. Edit the title/body in the save form; 'Also create a channel version' offers only: x:thread; choose one, Campaign 'Consult First', **Save as a content draft(s)** => a master draft (state backlog/draft) plus a channel variant flagged AI-drafted appears in /app/content; saving is NOT an approval (variant is draft)
8. /app/settings/ai-credits → Transactions => one 'AI run' debit equal to the charged amount; 'Your AI runs' lists the operation with tool, member, credits; Available decreased by exactly that amount

> Tester note:  Usefulness criteria with a REAL model (staging): output addresses the topic and audience, respects 'Anything it must include or avoid', contains no banned claims, no placeholder text, no invented figures (flagged if not in sources). Wording need not match between runs.

#### AI-10 — AI Studio tool: Facebook / Instagram caption & carousel copy (social_caption)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside signed in as owner; stand-in model (dev-verify) so drafts are labelled [TEST DRAFT]; note the Available balance on /app/settings/ai-credits first. |
| Start route / navigation | /app/studio → card 'Facebook / Instagram caption & carousel copy' (group Social) → /app/studio/social_caption |
| Final expected state | CosAiOperation completed; CosAiUsage payer client_wallet; draft saved to the correct destination. |
| Observable evidence | History page screenshot; transactions row; content draft. |
| Negative / alternate path | AIX-01..AIX-12 |
| Cleanup | Cancel the created drafts if noisy. |
| External access / cost / publication | Real model key on staging (check 1) |
| Requirement IDs · route/action · resulting state | C-AI-02, C-AI-03, C-AI-04, C-AI-05 · /app/studio/social_caption, /app/studio/history/[id] · studioQuote, studioRun, studioSave · CosCreditQuote→CosAiOperation completed→CosWorkItem/CosContentVariant draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Card visible and enabled in AI Studio (entitled by the seed contract) => opening the page shows the purpose text, 'What you get' note (handoff: 'captions; images/carousel slides come from Assets') and 'Typical maximum: a–b credits'
2. Required inputs: 'Topic or angle'; 'Placement' Instagram carousel — submit **Get quote** with them empty => inline validation, no quote created
3. Fill: 'Topic or angle'; 'Placement' Instagram carousel; optional: CTA, notes; Output limit 'Standard'; no research checkbox (tool is not research-capable); pick 'Sources to draw on' if offered => click **Get quote** => 'Quote: at most N credits (M available)… Valid until <time>' + ' TEST PRICES — synthetic rate card.'; button 'Run — up to N credits'
4. Change one input after the quote => 'You changed the inputs — get a new quote.' and the Run button disappears
5. Get a new quote and click **Run** => redirected to /app/studio/history/<id>; status queued/running with 'Up to N credits are held, not spent.'; page auto-refreshes; then 'Charged X of a maximum N credits.'
6. Result: a titled draft body ; 'Check before using:' flags listed if any
7. Edit the title/body in the save form; 'Also create a channel version' offers only: facebook:post, instagram:post, instagram:carousel; choose one, Campaign 'Consult First', **Save as a content draft(s)** => a master draft (state backlog/draft) plus a channel variant flagged AI-drafted appears in /app/content; saving is NOT an approval (variant is draft)
8. /app/settings/ai-credits → Transactions => one 'AI run' debit equal to the charged amount; 'Your AI runs' lists the operation with tool, member, credits; Available decreased by exactly that amount

> Tester note:  Usefulness criteria with a REAL model (staging): output addresses the topic and audience, respects 'Anything it must include or avoid', contains no banned claims, no placeholder text, no invented figures (flagged if not in sources). Wording need not match between runs.

#### AI-11 — AI Studio tool: YouTube script, titles & description (youtube_script)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside signed in as owner; stand-in model (dev-verify) so drafts are labelled [TEST DRAFT]; note the Available balance on /app/settings/ai-credits first. |
| Start route / navigation | /app/studio → card 'YouTube script, titles & description' (group Video) → /app/studio/youtube_script |
| Final expected state | CosAiOperation completed; CosAiUsage payer client_wallet; draft saved to the correct destination. |
| Observable evidence | History page screenshot; transactions row; content draft. |
| Negative / alternate path | AIX-01..AIX-12 |
| Cleanup | Cancel the created drafts if noisy. |
| External access / cost / publication | Real model key on staging (check 1) |
| Requirement IDs · route/action · resulting state | C-AI-02, C-AI-03, C-AI-04, C-AI-05 · /app/studio/youtube_script, /app/studio/history/[id] · studioQuote, studioRun, studioSave · CosCreditQuote→CosAiOperation completed→CosWorkItem/CosContentVariant draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Card visible and enabled in AI Studio (entitled by the seed contract) => opening the page shows the purpose text, 'What you get' note (handoff: 'a script is not a video — a person films/edits; finished file goes to Assets') and 'Typical maximum: a–b credits'
2. Required inputs: 'Topic or angle'; 'Target length (minutes)' 6 — submit **Get quote** with them empty => inline validation, no quote created
3. Fill: 'Topic or angle'; 'Target length (minutes)' 6; optional: audience, CTA, notes; Output limit 'Standard'; the 'Search the web and cite sources' checkbox is HIDDEN locally (no BRAVE_SEARCH_API_KEY); pick 'Sources to draw on' if offered => click **Get quote** => 'Quote: at most N credits (M available)… Valid until <time>' + ' TEST PRICES — synthetic rate card.'; button 'Run — up to N credits'
4. Change one input after the quote => 'You changed the inputs — get a new quote.' and the Run button disappears
5. Get a new quote and click **Run** => redirected to /app/studio/history/<id>; status queued/running with 'Up to N credits are held, not spent.'; page auto-refreshes; then 'Charged X of a maximum N credits.'
6. Result: a titled draft body ; 'Check before using:' flags listed if any
7. Edit the title/body in the save form; 'Also create a channel version' offers only: youtube:long_video; choose one, Campaign 'Consult First', **Save as a content draft(s)** => a master draft (state backlog/draft) plus a channel variant flagged AI-drafted appears in /app/content; saving is NOT an approval (variant is draft)
8. /app/settings/ai-credits → Transactions => one 'AI run' debit equal to the charged amount; 'Your AI runs' lists the operation with tool, member, credits; Available decreased by exactly that amount

> Tester note: After saving as youtube:long_video, the variant must show 'needs a finished video file from Assets'. Usefulness criteria with a REAL model (staging): output addresses the topic and audience, respects 'Anything it must include or avoid', contains no banned claims, no placeholder text, no invented figures (flagged if not in sources). Wording need not match between runs.

#### AI-12 — AI Studio tool: Shorts / Reels script & shot list (short_script)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside signed in as owner; stand-in model (dev-verify) so drafts are labelled [TEST DRAFT]; note the Available balance on /app/settings/ai-credits first. |
| Start route / navigation | /app/studio → card 'Shorts / Reels script & shot list' (group Video) → /app/studio/short_script |
| Final expected state | CosAiOperation completed; CosAiUsage payer client_wallet; draft saved to the correct destination. |
| Observable evidence | History page screenshot; transactions row; content draft. |
| Negative / alternate path | AIX-01..AIX-12 |
| Cleanup | Cancel the created drafts if noisy. |
| External access / cost / publication | Real model key on staging (check 1) |
| Requirement IDs · route/action · resulting state | C-AI-02, C-AI-03, C-AI-04, C-AI-05 · /app/studio/short_script, /app/studio/history/[id] · studioQuote, studioRun, studioSave · CosCreditQuote→CosAiOperation completed→CosWorkItem/CosContentVariant draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Card visible and enabled in AI Studio (entitled by the seed contract) => opening the page shows the purpose text, 'What you get' note (handoff: 'script + shot list only') and 'Typical maximum: a–b credits'
2. Required inputs: 'Topic or angle'; 'Length (seconds)' 30 — submit **Get quote** with them empty => inline validation, no quote created
3. Fill: 'Topic or angle'; 'Length (seconds)' 30; optional: CTA, notes; Output limit 'Standard'; no research checkbox (tool is not research-capable); pick 'Sources to draw on' if offered => click **Get quote** => 'Quote: at most N credits (M available)… Valid until <time>' + ' TEST PRICES — synthetic rate card.'; button 'Run — up to N credits'
4. Change one input after the quote => 'You changed the inputs — get a new quote.' and the Run button disappears
5. Get a new quote and click **Run** => redirected to /app/studio/history/<id>; status queued/running with 'Up to N credits are held, not spent.'; page auto-refreshes; then 'Charged X of a maximum N credits.'
6. Result: a titled draft body ; 'Check before using:' flags listed if any
7. Edit the title/body in the save form; 'Also create a channel version' offers only: youtube:short, instagram:reel; choose one, Campaign 'Consult First', **Save as a content draft(s)** => a master draft (state backlog/draft) plus a channel variant flagged AI-drafted appears in /app/content; saving is NOT an approval (variant is draft)
8. /app/settings/ai-credits → Transactions => one 'AI run' debit equal to the charged amount; 'Your AI runs' lists the operation with tool, member, credits; Available decreased by exactly that amount

> Tester note:  Usefulness criteria with a REAL model (staging): output addresses the topic and audience, respects 'Anything it must include or avoid', contains no banned claims, no placeholder text, no invented figures (flagged if not in sources). Wording need not match between runs.

#### AI-13 — AI Studio tool: Email sequence (email_sequence)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside signed in as owner; stand-in model (dev-verify) so drafts are labelled [TEST DRAFT]; note the Available balance on /app/settings/ai-credits first. |
| Start route / navigation | /app/studio → card 'Email sequence' (group Email & SEO) → /app/studio/email_sequence |
| Final expected state | CosAiOperation completed; CosAiUsage payer client_wallet; draft saved to the correct destination. |
| Observable evidence | History page screenshot; transactions row; content draft. |
| Negative / alternate path | AIX-01..AIX-12 |
| Cleanup | Cancel the created drafts if noisy. |
| External access / cost / publication | Real model key on staging (check 1) |
| Requirement IDs · route/action · resulting state | C-AI-02, C-AI-03, C-AI-04, C-AI-05 · /app/studio/email_sequence, /app/studio/history/[id] · studioQuote, studioRun, studioSave · CosCreditQuote→CosAiOperation completed→CosWorkItem/CosContentVariant draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Card visible and enabled in AI Studio (entitled by the seed contract) => opening the page shows the purpose text, 'What you get' note and 'Typical maximum: a–b credits'
2. Required inputs: 'What the sequence should achieve'; 'Emails' 3 — submit **Get quote** with them empty => inline validation, no quote created
3. Fill: 'What the sequence should achieve'; 'Emails' 3; optional: audience, CTA, notes; Output limit 'Standard'; the 'Search the web and cite sources' checkbox is HIDDEN locally (no BRAVE_SEARCH_API_KEY); pick 'Sources to draw on' if offered => click **Get quote** => 'Quote: at most N credits (M available)… Valid until <time>' + ' TEST PRICES — synthetic rate card.'; button 'Run — up to N credits'
4. Change one input after the quote => 'You changed the inputs — get a new quote.' and the Run button disappears
5. Get a new quote and click **Run** => redirected to /app/studio/history/<id>; status queued/running with 'Up to N credits are held, not spent.'; page auto-refreshes; then 'Charged X of a maximum N credits.'
6. Result: 3 emails with subject + body ; 'Check before using:' flags listed if any
7. Master draft only
8. /app/settings/ai-credits → Transactions => one 'AI run' debit equal to the charged amount; 'Your AI runs' lists the operation with tool, member, credits; Available decreased by exactly that amount

> Tester note:  Usefulness criteria with a REAL model (staging): output addresses the topic and audience, respects 'Anything it must include or avoid', contains no banned claims, no placeholder text, no invented figures (flagged if not in sources). Wording need not match between runs.

#### AI-14 — AI Studio tool: SEO brief & metadata (seo_brief)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside signed in as owner; stand-in model (dev-verify) so drafts are labelled [TEST DRAFT]; note the Available balance on /app/settings/ai-credits first. |
| Start route / navigation | /app/studio → card 'SEO brief & metadata' (group Email & SEO) → /app/studio/seo_brief |
| Final expected state | CosAiOperation completed; CosAiUsage payer client_wallet; draft saved to the correct destination. |
| Observable evidence | History page screenshot; transactions row; content draft. |
| Negative / alternate path | AIX-01..AIX-12 |
| Cleanup | Cancel the created drafts if noisy. |
| External access / cost / publication | Real model key on staging (check 1) |
| Requirement IDs · route/action · resulting state | C-AI-02, C-AI-03, C-AI-04, C-AI-05 · /app/studio/seo_brief, /app/studio/history/[id] · studioQuote, studioRun, studioSave · CosCreditQuote→CosAiOperation completed→CosWorkItem/CosContentVariant draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Card visible and enabled in AI Studio (entitled by the seed contract) => opening the page shows the purpose text, 'What you get' note and 'Typical maximum: a–b credits'
2. Required inputs: 'Target search phrase' — submit **Get quote** with them empty => inline validation, no quote created
3. Fill: 'Target search phrase'; optional: 'Page it is for (optional)', notes; Output limit 'Standard'; the 'Search the web and cite sources' checkbox is HIDDEN locally (no BRAVE_SEARCH_API_KEY); pick 'Sources to draw on' if offered => click **Get quote** => 'Quote: at most N credits (M available)… Valid until <time>' + ' TEST PRICES — synthetic rate card.'; button 'Run — up to N credits'
4. Change one input after the quote => 'You changed the inputs — get a new quote.' and the Run button disappears
5. Get a new quote and click **Run** => redirected to /app/studio/history/<id>; status queued/running with 'Up to N credits are held, not spent.'; page auto-refreshes; then 'Charged X of a maximum N credits.'
6. Result: brief + SEO meta (title/description shown read-only in the save form) ; 'Check before using:' flags listed if any
7. Edit the title/body in the save form; 'Also create a channel version' offers only: blog:article; choose one, Campaign 'Consult First', **Save as a content draft(s)** => a master draft (state backlog/draft) plus a channel variant flagged AI-drafted appears in /app/content; saving is NOT an approval (variant is draft)
8. /app/settings/ai-credits → Transactions => one 'AI run' debit equal to the charged amount; 'Your AI runs' lists the operation with tool, member, credits; Available decreased by exactly that amount

> Tester note:  Usefulness criteria with a REAL model (staging): output addresses the topic and audience, respects 'Anything it must include or avoid', contains no banned claims, no placeholder text, no invented figures (flagged if not in sources). Wording need not match between runs.

#### AI-15 — AI Studio tool: Repurpose source content (repurpose)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside signed in as owner; stand-in model (dev-verify) so drafts are labelled [TEST DRAFT]; note the Available balance on /app/settings/ai-credits first. |
| Start route / navigation | /app/studio → card 'Repurpose source content' (group Write) → /app/studio/repurpose |
| Final expected state | CosAiOperation completed; CosAiUsage payer client_wallet; draft saved to the correct destination. |
| Observable evidence | History page screenshot; transactions row; content draft. |
| Negative / alternate path | AIX-01..AIX-12 |
| Cleanup | Cancel the created drafts if noisy. |
| External access / cost / publication | Real model key on staging (check 1) |
| Requirement IDs · route/action · resulting state | C-AI-02, C-AI-03, C-AI-04, C-AI-05 · /app/studio/repurpose, /app/studio/history/[id] · studioQuote, studioRun, studioSave · CosCreditQuote→CosAiOperation completed→CosWorkItem/CosContentVariant draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Card visible and enabled in AI Studio (entitled by the seed contract) => opening the page shows the purpose text, 'What you get' note and 'Typical maximum: a–b credits'
2. Required inputs: 'Source content' (paste ~1,500 chars of synthetic text); 'Turn it into' X thread — submit **Get quote** with them empty => inline validation, no quote created
3. Fill: 'Source content' (paste ~1,500 chars of synthetic text); 'Turn it into' X thread; optional: notes; Output limit 'Standard'; no research checkbox (tool is not research-capable); pick 'Sources to draw on' if offered => click **Get quote** => 'Quote: at most N credits (M available)… Valid until <time>' + ' TEST PRICES — synthetic rate card.'; button 'Run — up to N credits'
4. Change one input after the quote => 'You changed the inputs — get a new quote.' and the Run button disappears
5. Get a new quote and click **Run** => redirected to /app/studio/history/<id>; status queued/running with 'Up to N credits are held, not spent.'; page auto-refreshes; then 'Charged X of a maximum N credits.'
6. Result: a titled draft body ; output derives only from the pasted source; figures not in the source are flagged; 'Check before using:' flags listed if any
7. Edit the title/body in the save form; 'Also create a channel version' offers only: linkedin:post, x:thread, blog:article, youtube:short; choose one, Campaign 'Consult First', **Save as a content draft(s)** => a master draft (state backlog/draft) plus a channel variant flagged AI-drafted appears in /app/content; saving is NOT an approval (variant is draft)
8. /app/settings/ai-credits → Transactions => one 'AI run' debit equal to the charged amount; 'Your AI runs' lists the operation with tool, member, credits; Available decreased by exactly that amount

> Tester note:  Usefulness criteria with a REAL model (staging): output addresses the topic and audience, respects 'Anything it must include or avoid', contains no banned claims, no placeholder text, no invented figures (flagged if not in sources). Wording need not match between runs.

#### AI-16 — AI Studio tool: Image generation (image)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside signed in as owner; stand-in model (dev-verify) so drafts are labelled [TEST DRAFT]; note the Available balance on /app/settings/ai-credits first. IMAGE_* is unset locally, so the card must show 'Unavailable — image provider not set up' (and the seed leaves image unentitled). Run the availability/refusal steps locally; run generation on staging (check 2). |
| Start route / navigation | /app/studio → card 'Image generation' (group Media) → /app/studio/image |
| Final expected state | CosAiOperation completed; CosAiUsage payer client_wallet; draft saved to the correct destination. |
| Observable evidence | History page screenshot; transactions row; content draft. |
| Negative / alternate path | AIX-01..AIX-12 |
| Cleanup | Cancel the created drafts if noisy. |
| External access / cost / publication | Real model key on staging (check 1) |
| Requirement IDs · route/action · resulting state | C-AI-02, C-AI-03, C-AI-04, C-AI-05 · /app/studio/image, /app/studio/history/[id] · studioQuote, studioRun, studioSave · CosCreditQuote→CosAiOperation completed→CosWorkItem/CosContentVariant draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Card visible and enabled in AI Studio (entitled by the seed contract) => opening the page shows the purpose text, 'What you get' note and 'Typical maximum: a–b credits'
2. Required inputs: 'Describe the image' (≥10 chars, no brand names / real people / 'in the style of') — submit **Get quote** with them empty => inline validation, no quote created
3. Fill: 'Describe the image' (≥10 chars, no brand names / real people / 'in the style of'); optional: —; Output limit 'Standard'; no research checkbox (tool is not research-capable); pick 'Sources to draw on' if offered => click **Get quote** => 'Quote: at most N credits (M available)… Valid until <time>' + ' TEST PRICES — synthetic rate card.'; button 'Run — up to N credits'
4. Change one input after the quote => 'You changed the inputs — get a new quote.' and the Run button disappears
5. Get a new quote and click **Run** => redirected to /app/studio/history/<id>; status queued/running with 'Up to N credits are held, not spent.'; page auto-refreshes; then 'Charged X of a maximum N credits.'
6. Result: an image saved to Assets as 'AI generated' production draft ; 'Check before using:' flags listed if any
7. Edit the title/body in the save form; 'Also create a channel version' offers only: asset; choose one, Campaign 'Consult First', **Save as a content draft(s)** => a master draft (state backlog/draft)  appears in /app/content; saving is NOT an approval (variant is draft)
8. /app/settings/ai-credits → Transactions => one 'AI run' debit equal to the charged amount; 'Your AI runs' lists the operation with tool, member, credits; Available decreased by exactly that amount

> Tester note: Prompt validator: 'logo of', 'trademark', 'in the style of', 'celebrity', 'nude' are refused before quoting. Price = base only. Usefulness criteria with a REAL model (staging): output addresses the topic and audience, respects 'Anything it must include or avoid', contains no banned claims, no placeholder text, no invented figures (flagged if not in sources). Wording need not match between runs.

#### AI-17 — AI Studio tool: Performance summary (performance_summary)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside signed in as owner; stand-in model (dev-verify) so drafts are labelled [TEST DRAFT]; note the Available balance on /app/settings/ai-credits first. |
| Start route / navigation | /app/studio → card 'Performance summary' (group Results) → /app/studio/performance_summary |
| Final expected state | CosAiOperation completed; CosAiUsage payer client_wallet; draft saved to the correct destination. |
| Observable evidence | History page screenshot; transactions row; content draft. |
| Negative / alternate path | AIX-01..AIX-12 |
| Cleanup | Cancel the created drafts if noisy. |
| External access / cost / publication | Real model key on staging (check 1) |
| Requirement IDs · route/action · resulting state | C-AI-02, C-AI-03, C-AI-04, C-AI-05 · /app/studio/performance_summary, /app/studio/history/[id] · studioQuote, studioRun, studioSave · CosCreditQuote→CosAiOperation completed→CosWorkItem/CosContentVariant draft |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Card visible and enabled in AI Studio (entitled by the seed contract) => opening the page shows the purpose text, 'What you get' note and 'Typical maximum: a–b credits'
2. Required inputs: — (none) — submit **Get quote** with them empty => inline validation, no quote created
3. Fill: — (none); optional: 'What you want to understand (optional)'; Output limit 'Standard'; no research checkbox (tool is not research-capable); pick 'Sources to draw on' if offered => click **Get quote** => 'Quote: at most N credits (M available)… Valid until <time>' + ' TEST PRICES — synthetic rate card.'; button 'Run — up to N credits'
4. Change one input after the quote => 'You changed the inputs — get a new quote.' and the Run button disappears
5. Get a new quote and click **Run** => redirected to /app/studio/history/<id>; status queued/running with 'Up to N credits are held, not spent.'; page auto-refreshes; then 'Charged X of a maximum N credits.'
6. Result: a narrative built ONLY from stored facts (enquiries, opportunities, sales per currency, published count, additive daily metrics; reach excluded) ; if the narrative contains a number not in the facts it is discarded and the flag 'The AI narrative was discarded (it contained …)' shows with a plain factual summary; null facts read 'not available', never 0; 'Check before using:' flags listed if any
7. No save form (display only)
8. /app/settings/ai-credits → Transactions => one 'AI run' debit equal to the charged amount; 'Your AI runs' lists the operation with tool, member, credits; Available decreased by exactly that amount

> Tester note: Compare every number in the output with /app/results for the same period. Usefulness criteria with a REAL model (staging): output addresses the topic and audience, respects 'Anything it must include or avoid', contains no banned claims, no placeholder text, no invented figures (flagged if not in sources). Wording need not match between runs.

#### AIX-01 — Insufficient credits refusal and recovery

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner-c@growthos-test.example.com (owner of workspace C, provisioned in OPS-02) (or owner@ after spending) |
| Preconditions and test data | Workspace C has 40 included credits (SCOPE-02) — or operator adjusts a wallet down with a negative adjustment. |
| Start route / navigation | /app/studio/blog_article? (use an entitled tool) with Output limit 'Long' |
| Final expected state | Zero credits blocks metered AI only. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-UX-02 · /app/studio/[tool] · studioQuote (CreditError insufficient) · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Get quotes and run until the next quote exceeds the balance => 'Get quote' returns the insufficient message with needed vs available and an 'Add credits' link (owner) — 'Card purchases are not open yet' on the credits page locally
2. As a member without org.billing (campaign_manager) => message 'Ask a workspace billing admin to add credits.' and 'You can keep writing and editing content by hand — only AI runs need credits.'
3. Operator grants 50 promotional credits (OPS-05) => quote now succeeds
4. Zero-credit wallet: content editing, approvals, publishing still work (CONT-04 steps) => confirmed

#### AIX-02 — Quote expiry (10 minutes)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Any entitled tool. |
| Start route / navigation | /app/studio/linkedin_post |
| Final expected state | Expired quotes never run. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-CR-08 · /app/studio/[tool] · studioRun (executeQuote) · CosCreditQuote expired |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Get a quote, note 'Valid until'; wait 11 minutes; click **Run** => refused 'quote expired — get a new quote'; no operation created; balance unchanged
2. Technical alternative: edit the quote's expiresAt in the DB to the past and Run => same

#### AIX-03 — Repeated submission / double click / two tabs

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser + technical · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Entitled tool. |
| Start route / navigation | /app/studio/x_post |
| Final expected state | One operation per (org, requestId); one provider call. |
| Observable evidence | Transactions list. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-CR-05 · /app/studio/[tool] · executeQuote · CosAiOperation unique (orgId, requestId) |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Get a quote; double-click **Run** rapidly => one history page; /app/settings/ai-credits shows ONE 'AI run' debit and one operation
2. Open the quoted form in two tabs (same quote) and Run in both => the second lands on the same operation (duplicate detected) — one debit
3. Technical: `npx vitest run tests/os/completion-credits.test.ts -t "duplicate"` => passes

> Tester note: Three layers: requestId, quote usedAt claim, job idempotency key.

#### AIX-04 — Provider failure → not charged; hold released

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Stand-in model; note balance. |
| Start route / navigation | /app/studio/linkedin_post |
| Final expected state | Failed operation; reservation released. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-CR-10 · /app/studio/history/[id] · runOperation → close(ok:false) · CosAiOperation failed; CosCreditReservation released |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Topic 'FORCE_PROVIDER_ERROR test' (magic string for the stand-in) → quote → Run => history shows 'This run did not produce a draft' with 'The AI provider could not complete this request. You have not been charged.' and **Try again with a new quote**
2. Balance => unchanged; Transactions => no debit; 'Your AI runs' lists the failed run with 0 credits
3. Operator /admin/os/credits → Wallets => Brightside 'Ledger check: balanced'; usage row shows provider cost NULL/unknown, never 0

> Tester note: The magic string works only against /api/dev/llm.

#### AIX-05 — Validator discard (banned claim / placeholder) → not charged

| Field | Value |
|---|---|
| Priority / type / environment | P0 · API/action (harness) · Local (dev-verify, http://localhost:3100) |
| Account and role | Tester |
| Preconditions and test data | Test DB marked. |
| Start route / navigation | PowerShell |
| Final expected state | Deterministic validators gate every output. |
| Observable evidence | Vitest output; staging screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Real model for browser |
| Requirement IDs · route/action · resulting state | C-CR-10 · n/a · copyProblems · failed |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Run `npx vitest run tests/os/completion-credits.test.ts -t "validator"` => passes (model output containing 'guarantee'/'lorem ipsum' is discarded, no charge)
2. Browser (staging, real model): ask a tool to 'include the phrase risk-free guarantee' => run ends 'did not pass our checks and was discarded (…)'. You have not been charged

> Tester note: The stand-in cannot be steered to emit banned text, hence harness locally.

#### AIX-06 — Timeout → uncertain attempt, hold released, never re-sent

| Field | Value |
|---|---|
| Priority / type / environment | P0 · API/action (harness) · Local (dev-verify, http://localhost:3100) |
| Account and role | Tester |
| Preconditions and test data | Test DB. |
| Start route / navigation | PowerShell |
| Final expected state | Metered timeouts are not retried. |
| Observable evidence | Vitest output. |
| Negative / alternate path | — |
| Cleanup | Restore LLM_BASE_URL. |
| External access / cost / publication | Staging model |
| Requirement IDs · route/action · resulting state | C-CR-09 · n/a · withLlmUsage (LlmTimeoutError) · CosAiAttempt uncertain |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Run `npx vitest run tests/os/release-gaps.test.ts -t "timeout"` => passes: attempt uncertain, cost NULL, operation failed with 'took too long', hold released, exactly ONE provider call
2. Staging (check 1 step): point LLM_BASE_URL at an unroutable host for one run => run ends 'not charged'; provider dashboard shows no extra calls

> Tester note: Decision 44.

#### AIX-07 — Worker lost mid-run → uncertain, credits held, operator closes without charge

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser + technical · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) + Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | Scheduler running. |
| Start route / navigation | /app/studio/linkedin_post |
| Final expected state | Uncertain never auto-retried/auto-released. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-CR-09, C-UX-03 · /admin/os/credits · reconcileStudio, operationRelease · CosAiOperation uncertain→failed |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Get quote and Run; IMMEDIATELY stop the dev server (Ctrl+C) before it completes (the stand-in is fast — alternatively set the operation row to status running, startedAt = now-20min, output NULL in the DB)
2. Restart; wait one tick => history shows 'We are checking this one — Our team has been alerted'; credits page 'Held by running AI' includes the hold; balance not debited
3. Operator /admin/os/credits → 'Held and unresolved' lists it; click **Close without charge** with empty 'What you checked' => refused; with a reason => operation failed 'closed by our team. You have not been charged.'; hold released; audit row
4. Client credits page => Available restored; low-balance not triggered by held credits

> Tester note: A run whose draft WAS stored is recovered and charged once instead (harness: completion-credits 'recovered').

#### AIX-08 — Concurrency: parallel runs cannot overspend; member caps

| Field | Value |
|---|---|
| Priority / type / environment | P0 · API/action (harness) · Local (dev-verify, http://localhost:3100) |
| Account and role | Tester |
| Preconditions and test data | Test DB. |
| Start route / navigation | PowerShell |
| Final expected state | Atomic reservations under the wallet lock. |
| Observable evidence | Vitest output; screenshot. |
| Negative / alternate path | — |
| Cleanup | Clear the limit. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-CR-04 · /app/settings/ai-credits · reserve, creditsMemberLimit · CosCreditMemberLimit |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. `npx vitest run tests/os/completion-credits.test.ts -t "parallel"` => passes (6 parallel on 20 credits → 2 succeed; 4 parallel under a cap → 1)
2. Browser: owner sets Member limits for analyst-turned-campaign_manager to 3 credits (**Save**) => that member's quote page says 'Your personal limit is 3 credits a month…'; a 5-credit quote → 'Your monthly AI limit is 3 credits and 0 are used or held. Ask a workspace admin to raise it.'; blank limit deletes it

> Tester note: Caps count held + settled in the workspace-zone calendar month; they never add credits.

#### AIX-09 — Tampered quote fields / rate change after quote

| Field | Value |
|---|---|
| Priority / type / environment | P1 · API/action (harness) + browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Tester + Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | Test DB. |
| Start route / navigation | PowerShell |
| Final expected state | Quotes pin the rate version. |
| Observable evidence | Transactions row. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-CR-06, C-CR-08 · /admin/os/credits · rateCardActivate, executeQuote · CosCreditQuote.rateVersion |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. `npx vitest run tests/os/completion-credits.test.ts -t "forged"` and `-t "rate"` => pass (forged price ignored; accepted price unchanged after a rate change)
2. Browser: get a quote (note N); operator creates and activates a new SYNTHETIC rate card with doubled prices; Run the old quote => charged under the old version (≤ N)

#### AIX-10 — Source selection per run and cross-tenant refusal

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser + harness · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Two sources exist (ONB-04). |
| Start route / navigation | /app/studio/blog_outline |
| Final expected state | Source pick is hashed into the quote. |
| Observable evidence | Screenshot; vitest. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-AI-09 · /app/studio/[tool] · cleanInputs, checkLinks · inputs.sourceIds |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Sources to draw on' shows the workspace sources (max 20) => tick one, quote, run => the run's inputs record only that source id; with a real model the draft cites only it
2. Devtools: add a sourceIds value from Northwind (another org) and quote => refused (checkLinks: source not in org)
3. `npx vitest run tests/os/completion-credits.test.ts -t "source"` => passes

#### AIX-11 — Research mode: hidden without key; real retrieval with citations

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser + integration · Local + configuration |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Locally: BRAVE_SEARCH_API_KEY unset. Staging: key + RESEARCH_PRICE_MICROS + a 'research' line on the rate card (check 3). |
| Start route / navigation | /app/studio/blog_outline |
| Final expected state | Research is real or absent; provenance retained through edit/save/export. |
| Observable evidence | Screenshots; provider dashboard; export JSON aiStudio.operations sources. |
| Negative / alternate path | — |
| Cleanup | Delete the draft. |
| External access / cost / publication | Brave Search plan (purchase decision; confirm terms allow AI use) |
| Requirement IDs · route/action · resulting state | C-AI-06, C-RSH-01 · /app/studio/[tool] · createQuote, runText (research) · output.sources; CosAiUsage modality search |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Local: page banner reads 'Source-based drafting. … Nothing is looked up on the web'; no research checkbox; devtools-add research=on and quote => 'Web research is not set up on this platform…'
2. Staging: banner 'Source-based drafting, with optional web research'; tick 'Search the web and cite sources'; quote => max credits include the research line; run => draft with [n] markers and a 'Sources (check each before publishing)' block listing title, https link, 'retrieved YYYY-MM-DD'; first flag is the standing notice that citations are NOT a fact-check
3. Open every listed link => it exists and the cited sentence's words/figures appear in that page's snippet-level text; a figure not in the snippet would have discarded the draft (verify one flag 'Source [n] may not support' if present)
4. Edit the draft: delete one [n] marker and save => the Sources block is rebuilt without it; add a new '[9]' by hand and save => refused (marker with no stored source)
5. /app/settings/ai-credits => a separate 'search' usage row at the configured price in addition to the model charge
6. Provider dashboard => the query equals exactly the typed topic (no lead/client data)

> Tester note: Grounding is search snippets only; pages are not read. Never label as verified.

#### AIX-12 — Staff 'Who pays': Catalyst internal by default; client-billed only with authorisation

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) + owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside; note the balance. |
| Start route / navigation | /app/studio/linkedin_post as lead@ |
| Final expected state | Payer from purpose + explicit authorisation, never role. |
| Observable evidence | Credits console 'who paid' table; screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-PAYER-01, C-PAYER-02 · /app/studio/[tool], /app/settings/ai-credits · resolvePayer, creditsStaffAuth · CosAiBillingAuth; CosAiUsage payer |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Who pays for this run' fieldset: 'Catalyst (internal)' selected; 'Client's credits' disabled '(none on file)' => quote shows 'Run (Catalyst pays)'; run => client balance unchanged; the unentitled 'Article draft' tool IS available to staff internally
2. Owner: /app/settings/ai-credits → 'Catalyst staff using your credits' → Most credits 10, Until next week, What for 'help with October posts' → **Authorise** => listed 'Up to 10 credits (0 used) until …'
3. Lead: reload the tool => 'Client's credits (on file)' selectable; choose it, quote (max ≤ 10) and run => client debit; auth shows used; quote above the remaining ceiling => 'auth cap' refusal
4. Owner clicks **End now** => lead's next quote with 'Client's credits' => 'The client has not authorised staff-assisted AI…'
5. Staff try to create an authorisation (devtools) => 'Forbidden.'

#### AIX-13 — Save brief as a draft campaign: repeat clicks and provenance

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) then lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | AI-01 completed run. |
| Start route / navigation | /app/studio/history/<campaign_brief run id> |
| Final expected state | One draft campaign per run; provenance in revision 1, audit, run.savedTo. |
| Observable evidence | Screenshots; DB row of CosRevision (technical). |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-AI-05 · /app/studio/history/[id] · studioSaveCampaign (saveBriefAsCampaign) · CosCampaign draft; CosRevision v1 |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Save as a campaign' form is pre-filled (name, objective, audience, key message, offer, CTA, channels pre-ticked from the brief) => edit the Objective, click **Save as a draft campaign** => link to /app/content/campaigns/<id>; campaign status draft
2. Click **Save as a draft campaign** again (and triple-click) => 'This brief was already saved as a campaign. Nothing new was created.'; only one campaign
3. Owner opens the campaign => can view; cannot activate (no work.manage): status select absent/refused
4. Lead: campaign page shows the brief; the first revision (technical: CosRevision subject campaign v1) carries provenance run id, edited fields (objective), measures; staff notification 'campaign_draft' appeared
5. Balance => unchanged by saving (no credits, no model call)

> Tester note: Row lock on the operation prevents races.

#### AIX-14 — History visibility and cross-tenant 404

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | campaign_manager member + owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Runs by two different members exist. |
| Start route / navigation | /app/studio |
| Final expected state | canSeeAllUsage = org.billing or work.manage. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-UX-01 · /app/studio/history/[id] · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. As campaign_manager => 'Your recent runs' lists only own runs; opening another member's history id => 404
2. As owner => 'Recent runs in this workspace' lists all; open the Northwind org's run id (none exist) / any foreign id => 404

#### AIX-15 — AI drafts cannot bypass QA/approval; read-only workspace blocks Studio

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | A saved Studio variant. |
| Start route / navigation | /app/content/<master id> |
| Final expected state | Credits never authorise publication. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-AI-08 · /app/studio · toolAvailability, moveVariant · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Owner tries to move the AI-drafted variant to client_review => refused; only staff QA can
2. After handover (SET-11) open /app/studio => tools unavailable ('workspace is read-only'); quote refused


### H. Credits

#### CRD-01 — Wallet page: balances, held, grant kinds, expiry, usage, transactions

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Seed: 60 included credits expiring in 60 days; some runs done. |
| Start route / navigation | /app/settings/ai-credits |
| Final expected state | Read-only truth of the ledger. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-UX-01, C-CR-01 · /app/settings/ai-credits · walletSummary · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Balance card => Available, 'Held by running AI', Purchased, Included, Promotional; 'expiring' list shows the included grant with its date
2. Usage this month => By tool and By member tables match 'Your AI runs'; Transactions => labels 'Credits added', 'AI run', 'Expired', 'Refund / dispute', 'Adjustment by Catalyst'
3. The page states AI credits are separate from lead tokens; /app/settings/billing 'Token balance' is unaffected by any AI run (compare before/after a run)
4. As analyst => page denied (needs ai.use or org.billing); as campaign_manager => balance visible but no Buy/settings sections (needs org.billing)

#### CRD-02 — Operator grants: included/promotional/adjustment, idempotent, purchased refused

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | Admin session. |
| Start route / navigation | /admin/os/credits → Grant or adjust |
| Final expected state | Grants with provenance; ledger append-only. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None (record grants in the tracker). |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-CR-02, C-CR-03, C-CR-07, C-UX-03 · /admin/os/credits · walletGrant · CosCreditGrant; CosCreditLedger |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Workspace id Brightside, Type Promotional, Credits 25, Expires on blank AND 'does not expire' unticked, Reason 'test' => refused (explicit expiry choice required)
2. Tick 'does not expire' => granted; client Transactions shows 'Credits added' with the reason
3. Press the browser Back and resubmit the same form (same hidden ref) => 'Already recorded — nothing was added twice.'
4. Type Adjustment, Credits -5, Reason 'correction' => ledger 'Adjustment by Catalyst' -5; balance -5
5. Reason empty => refused; Type 'purchased' via devtools => 'Purchased credits come only from a verified payment.'
6. Wallets table => 'Ledger check: balanced' for Brightside

#### CRD-03 — Grant expiry sweep never touches held credits

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser + technical · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) + owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Scheduler running. |
| Start route / navigation | /admin/os/credits |
| Final expected state | Expired grants zeroed; held credits intact. |
| Observable evidence | Transactions; vitest. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Scheduler |
| Requirement IDs · route/action · resulting state | C-CR-07 · n/a · expireGrants · CosCreditLedger expire |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Grant 5 promotional credits to Brightside with Expires on = tomorrow; technical: set that grant's expiresAt to 1 minute ago; wait a tick => Transactions shows 'Expired' -5; balance -5
2. Harness: `npx vitest run tests/os/completion-credits.test.ts -t "expir"` => passes (active reservation survives expiry)

> Tester note: Purchased credits never expire.

#### CRD-04 — Low-balance in-app notice and email (once per episode)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser + background job · Local + configuration |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Locally email is logged to the dev console (no Resend key). Balance e.g. 40. |
| Start route / navigation | /app/settings/ai-credits → Low-balance notice |
| Final expected state | Billing members only; one per episode; 24 h cooldown; held credits do not count as low for email. |
| Observable evidence | Dev console mail lines; dashboard notice. |
| Negative / alternate path | — |
| Cleanup | Clear the level. |
| External access / cost / publication | Resend key for real delivery |
| Requirement IDs · route/action · resulting state | C-UX-01 · /app/settings/ai-credits · creditsSettings, lowBalanceNotice · CosCreditWallet lowArmed/lowNotifiedAt |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Tell us when credits fall to' 100, tick 'Also email the people who manage billing here', **Save** => saved; run one tool => dashboard Updates shows 'AI credits are running low (N left, M held…)'; dev console logs ONE mail to the owner (billing member) only — not to lead@/specialist@
2. Run another tool => no second email; a second in-app notice the same day is deduped
3. Raise the level to 200 => re-armed; next run logs one more email (level changed) — but within 24 h cooldown? Expected: changed level re-arms; cooldown still applies to the SAME episode; record actual
4. Operator grants 500 credits (above level) then it falls again after 24 h => one more email
5. Untick the email option => in-app notice only

> Tester note: Staging (check 7) with a Catalyst-owned mailbox.

#### CRD-05 — Credit-pack checkout closed until real config; synthetic labels

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) + Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | Local: synthetic rate card + synthetic pack; no Stripe keys. |
| Start route / navigation | /app/settings/ai-credits → Add credits |
| Final expected state | No client can be charged at made-up prices. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Leave the draft card. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-PAY-01, C-PRICE-01 · /app/settings/ai-credits, /admin/os/credits · availablePacks, rateCardActivate · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Client => 'Card purchases are not open yet' with the reason 'Card payments are not set up.'; the synthetic pack (if listed) is labelled '· TEST PACK'
2. Quote panel on any tool => ' TEST PRICES — synthetic rate card.'
3. Operator /admin/os/credits => banner 'Client purchases are closed.' listing exactly: active non-synthetic rate card, at least one real pack, STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET
4. Operator: **New rate card** from the pre-filled PROPOSED_RATES with 'Synthetic' unticked → save draft → **Activate** => refused 'profitability check failed' naming the missing LLM_PRICE_*/pack/FX values (cannot check ≠ profitable)

> Tester note: Synthetic rows are refused in production (tested).

#### CRD-06 — Stripe test-mode purchase; tab closed before redirect; success page never grants

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser + integration · Staging |
| Account and role | owner@growthos-demo.example.com (owner, seed) (staging synthetic workspace) |
| Preconditions and test data | Staging with sk_test key, webhook endpoint (8 events) forwarded; a real non-synthetic rate card activated (owner-accepted prices) and one real pack. Locally this can be simulated with `stripe listen --forward-to localhost:3100/api/stripe/webhook` and test keys in .env.development.local — configuration test. |
| Start route / navigation | /app/settings/ai-credits → Add credits → Buy |
| Final expected state | Credits appear once from a verified, order-matched event. |
| Observable evidence | Stripe test dashboard event list; Purchases table. |
| Negative / alternate path | CRD-07, CRD-08 |
| Cleanup | None (test mode). |
| External access / cost / publication | Stripe test keys; owner-accepted prices |
| Requirement IDs · route/action · resulting state | C-PAY-02, C-PAY-03, C-PAY-04 · /app/settings/ai-credits, POST /api/stripe/webhook · createCreditCheckout, handleCreditEvent · CosCreditOrder paid; CosCreditGrant purchased |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Click **Buy** on a pack => Stripe Checkout in TEST mode with the server-side amount; devtools: alter the pack id/amount in the request => ignored (order is server-priced)
2. Pay with card 4242 4242 4242 4242 and CLOSE the tab before the redirect => open /app/settings/ai-credits => after the webhook: Purchases shows the order 'paid'; Transactions 'Credits added' ONCE with reference order:<id>
3. Open /app/settings/ai-credits?order=<id> repeatedly => banner 'Payment confirmed. N credits were added.' — no additional grant
4. Stripe dashboard → resend the checkout.session.completed event => 'duplicate'; still one grant; Ledger check balanced
5. Cancel a second checkout (back link) => '?cancelled=' banner 'You have not been charged.'; order stays pending → expires via checkout.session.expired
6. Confirm /app/settings/billing token balance and any engagement invoices are untouched

> Tester note: A live-mode event can never credit a test order (mode check).

#### CRD-07 — Failed / delayed / out-of-order payments, wrong amount, bad signature

| Field | Value |
|---|---|
| Priority / type / environment | P0 · API/action (harness) + integration · Local (dev-verify, http://localhost:3100) |
| Account and role | Tester |
| Preconditions and test data | Test DB. |
| Start route / navigation | PowerShell |
| Final expected state | Only signed, matching events change state. |
| Observable evidence | Vitest output; curl response. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Stripe test |
| Requirement IDs · route/action · resulting state | C-PAY-04, C-SAFE-04 · POST /api/stripe/webhook · verifyStripeSignature, handleStripeEvent · CosPaymentEvent |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. `npx vitest run tests/os/completion-credits.test.ts -t "purchase"` => passes: unsigned webhook → 400; wrong amount/currency/mode/session ignored; async_payment_failed → order failed; expired → expired; out-of-order refund-before-paid converges
2. Staging: use a test card that fails (4000 0000 0000 0002) => banner 'The payment did not go through… no credits were added.'
3. Staging: send a webhook with a tampered signature (curl) => 400; nothing changes

#### CRD-08 — Partial and full refunds, disputes, deficit, AI paused

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser + integration · Staging |
| Account and role | owner@growthos-demo.example.com (owner, seed) + Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | CRD-06 purchase of a pack (e.g. 250 credits) and ~100 credits already spent from it. |
| Start route / navigation | Stripe test dashboard |
| Final expected state | Target-based reconciliation; no double reversal; no auto-charge. |
| Observable evidence | Transactions; operator orders table; Stripe events. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Stripe test |
| Requirement IDs · route/action · resulting state | C-PAY-05 · /app/settings/ai-credits, /admin/os/credits · reconcileOrder, reverseOrderCredits, payDownDeficit · CosCreditOrder refunded/disputed; wallet.deficit |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Refund half of the payment => wallet 'Refund / dispute' reverses floor(credits × refunded ÷ paid) once; Purchases shows part_refunded
2. Refund the rest => remaining unspent credits reversed; the already-spent portion becomes wallet.deficit; client Studio and credits page show 'AI tools are paused… Nothing is charged automatically; new credits cover that first'; any quote → 'restricted' refusal
3. Operator grants 50 promotional => deficit paid down first; remaining 50-deficit available; AI resumes
4. Second purchase: open a test dispute => all its credits held/reversed; win the dispute => exactly restored; lose => stays reversed; replay dispute.created after closed => ignored
5. Wallets 'Ledger check' stays balanced throughout; lead tokens and invoices unchanged

> Tester note: Harness equivalent: completion-credits refund/dispute tests (run locally).

#### CRD-09 — Operator console: anomalies, invariant, who-paid, packs lifecycle

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | Several runs done. |
| Start route / navigation | /admin/os/credits |
| Final expected state | Operator sees and reconciles every state. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-UX-03 · /admin/os/credits · packCreate, packRetire · CosCreditPack |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'AI consumption — who paid' => rows split client_wallet vs catalyst_internal with purposes
2. **New pack**: Label 'Test 100', Credits 100, Currency 'INR', Price 49900, Market IN, Synthetic ticked => listed '· SYNTHETIC'; **Retire** => retired; 'Existing orders are unaffected.'
3. Pack with currency 'rupees' or price non-integer => refused
4. Usage anomalies card => appears when a workspace spends ≥20 credits in 24 h at >3× its average or fails >50% of ≥4 runs (trigger by running 4 forced failures AIX-04) => Brightside listed
5. Technical: run `npx vitest run tests/os/completion-operator.test.ts` => passes (grants once on double click; bounded adjustments; real card refused without margin data)

#### CRD-10 — Engagement invoice card payment, refund and dispute (non-credit)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser + integration · Staging |
| Account and role | owner@growthos-demo.example.com (owner, seed) + lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | An issued commercial record (ENG-02); Stripe test. |
| Start route / navigation | /app/engagement/<id> → Commercial record |
| Final expected state | Invoice refunds follow cumulative totals; disputes only notify. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Stripe test |
| Requirement IDs · route/action · resulting state | C-PAY-06 · /app/engagement/[id] · recordPay, handleStripeEvent · CosCommercialRecord paid/refunded |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Owner **Pay by card** => Stripe test checkout; pay => record 'paid' with paidBasis webhook
2. Refund half in Stripe => record part_paid/refunded from the cumulative total; payment status re-derived
3. Open a dispute => staff notification 'payment' flagged; record balance unchanged automatically

> Tester note: Lead-token refunds are manual review only (by design).

#### CRD-11 — Lead tokens are separate from AI credits

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) + Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | Brightside has lead_supply module. |
| Start route / navigation | /admin/leados/tokens |
| Final expected state | Two ledgers never cross. |
| Observable evidence | Both pages side by side. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-CR-01 · /app/settings/billing, /admin/leados/tokens · grantTokens · LosTokenLedger |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Operator grants 100 tokens to Brightside with Reason => /app/settings/billing 'Token balance' 100; /app/settings/ai-credits unchanged
2. Run an AI tool => token balance still 100; Ledger on billing page has no AI rows
3. Discover: reveal one contact (LEAD-06) => token reveal_debit; AI credits unchanged


### I. Assets

#### AST-01 — Upload image, download, details, approve (client-only for brand/source)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) then owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | ASSET_STORAGE=local (dev-verify). Have a 200 KB PNG, a 2 MB JPEG. |
| Start route / navigation | /app/assets → Upload |
| Final expected state | Private storage; membership-checked route; client-only approval of brand/source. |
| Observable evidence | Screenshots; signed-out response. |
| Negative / alternate path | AST-02 |
| Cleanup | Archive the assets (status archived) — there is no delete. |
| External access / cost / publication | Local disk; staging = Vercel Blob (check 4) |
| Requirement IDs · route/action · resulting state | C-REL-05 · /app/assets, POST /api/os/assets, GET /api/os/assets/[id] · uploadAsset, addAssetVersion, updateAsset · CosAsset draft/approved; CosAssetVersion |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. File PNG, Name 'Clinic exterior', Type 'Brand', 'Who owns it' 'Clinic, licensed' => **Upload** => appears under Brand as draft; version v1; **Download** returns the same bytes (compare size)
2. Copy the download URL, open it in a signed-out window => 401/redirect, never the file
3. Specialist clicks **Approve** on the brand asset => refused (brand/source approval is client-only); owner **Approve** => approved
4. Upload a new version (**Upload new version**) with the JPEG => refused? Expected: same kind (image) allowed; asset drops back to draft ('approval was for the old bytes'); v2 listed; v1 still downloadable via ?v=1
5. Details: set 'Visible to the client' off as owner => not offered (only staff can make internal files); as specialist tick 'Internal working file' on upload => owner cannot see it in the list nor via URL (404)
6. Tags: enter 14 tags => only 12 kept, lowercased

> Tester note: Storage key ${orgId}/${assetId}/v${n}; bytes never reach the browser by storage address.

#### AST-02 — Unsupported types, size limits, content sniffing, missing fields

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) |
| Preconditions and test data | Prepare: an .svg, an .exe renamed to .png, a .txt renamed .pdf, a 16 MB PNG, a 30 MB MP4 (valid), a valid 2-page PDF, a .docx. |
| Start route / navigation | /app/assets → Upload |
| Final expected state | Only listed MIME types with matching magic bytes are stored. |
| Observable evidence | Screenshots of each refusal. |
| Negative / alternate path | — |
| Cleanup | Archive. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-REL-05 · POST /api/os/assets · check(), sniffOk() · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Upload .svg => 'That file type is not accepted.'
2. Upload the renamed .exe as PNG => 'The file's contents do not match its type.'
3. Upload the 16 MB PNG => refused with the 15 MB limit named
4. Upload the 30 MB MP4 as Production, Video length 30 => accepted (limit 512 MB); kind video
5. Upload the valid PDF as Source material => accepted (kind document); the .docx => accepted
6. Upload with an empty File => refused; Name over 200 chars => capped
7. Upload with the workspace kill switch ON => still allowed (uploads are not gated by the kill switch) — record

> Tester note: Limits: images 15 MB, video 512 MB, audio 50 MB, PDF/DOCX 25 MB, PPTX 50 MB, ZIP 100 MB, text 5 MB.

#### AST-03 — Use in content; another workspace's asset; archived asset

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) |
| Preconditions and test data | AST-01 image approved; Northwind has its own asset (upload one as owner there). |
| Start route / navigation | /app/content/<master id> → variant edit |
| Final expected state | Media references are tenant-scoped. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-REL-05 · /app/content/[id] · variantEdit · CosContentVariant.mediaAssetIds |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Media from Assets' lists only Brightside assets => tick the image, save => variant media set; contentHash changes (approval revoked if it was approved)
2. Devtools: add the Northwind asset id to mediaAssetIds and save => refused (asset not in org)
3. Archive the image in Assets (status archived) => it disappears from the media picker; existing variant keeps its reference (record what the card shows)

#### AST-04 — Signed media link for providers: expiry, tamper, no session

| Field | Value |
|---|---|
| Priority / type / environment | P0 · API/action (harness) + integration · Local + configuration |
| Account and role | Tester |
| Preconditions and test data | Test DB. Staging for the real link (check 4). |
| Start route / navigation | PowerShell |
| Final expected state | Links are per version, HMAC-signed, time-limited. |
| Observable evidence | Vitest; curl outputs. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Vercel Blob + public https origin |
| Requirement IDs · route/action · resulting state | C-REL-05 · GET /api/os/media/[versionId] · mediaLink, verifyMediaLink · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. `npx vitest run tests/os/completion-adapters.test.ts -t "media link"` and `tests/os/completion-entry.test.ts -t "media"` => pass (valid link 200; bad/expired 404)
2. Local: mediaOrigin() is null (localhost) => an Instagram/Facebook publish attempt reports 'needs MEDIA_PUBLIC_ORIGIN or SITE_URL' honestly (PUB-07)
3. Staging: take the 30-minute link from a publish attempt log; fetch it from another network => 200 with correct type/size; change one signature character => 404; after 31 minutes => 404; the raw Blob URL is not reachable

#### AST-05 — Deletion and retention policy; storage disconnected

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser + technical · Local + configuration |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) + Tester |
| Preconditions and test data | Assets exist. |
| Start route / navigation | /app/assets |
| Final expected state | Nothing is deleted; storage failure leaves no orphan rows. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Restore ASSET_STORAGE=local. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-REL-05 · /app/assets · uploadAsset rollback · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Look for a Delete control => none exists; only status 'archived' via Details. Record: no user deletion; no automatic retention/cleanup (gap G-AST-1 — owner decision on retention)
2. Technical: confirm no storage.del call from lib/os/assets.ts (only the failed-upload rollback deletes a row)
3. Set ASSET_STORAGE to an invalid value and restart => Assets page shows 'File storage requires setup'; upload => 'Asset storage is not set up yet…' and NO orphan CosAsset row (check the list after restart with local storage)
4. Handover (SET-11) => assets still downloadable and listed in the export manifest with sha256

#### AST-06 — Export list and asset manifest

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Assets exist. |
| Start route / navigation | /app/assets → Export list |
| Final expected state | Manifest respects visibility. |
| Observable evidence | File. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /api/os/export · buildExport · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. **Export list** => JSON/manifest listing every client-visible asset with version, sha256 and a download path; internal-only files absent for clients
2. As lead => internal files included

#### AST-07 — Staff image generation into Assets (internal)

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local + configuration |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | IMAGE_* unset locally. |
| Start route / navigation | /app/assets → Generate an image |
| Final expected state | Internal generation never debits the client. |
| Observable evidence | Screenshot; credits console. |
| Negative / alternate path | — |
| Cleanup | Archive. |
| External access / cost / publication | Image provider key |
| Requirement IDs · route/action · resulting state | C-PAYER-02 · /app/assets · generateImage · CosAsset origin ai_generated |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Locally => 'Requires setup' and the button disabled/refuses
2. Staging (check 2): prompt 'a bright dental reception, no people' → **Generate draft image** => asset 'AI generated' draft; usage row catalyst_internal; client balance untouched


### J. Publishing

#### PUB-01 — Capability disclosure per provider and account

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | No provider client ids locally. |
| Start route / navigation | /app/settings/workspace → Connections |
| Final expected state | Unavailable/unsupported capabilities are stated, never implied. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Provider apps on staging |
| Requirement IDs · route/action · resulting state | C-CNT-01 · /app/settings/workspace · discoverAccounts, providerEnabled · CosConnection.capabilities |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Each OAuth provider (Google Search Console/GA4, LinkedIn, X, Meta, YouTube) shows 'not configured on this server' and no working Connect => confirm none can be started; open /api/os/connect/linkedin/start => 404
2. AccountsPanel => the seeded 'Test account (always succeeds)' shows 'Can publish: yes · Can read results: yes' and 'Development only — nothing is posted anywhere.'; WordPress form present (application password) with instructions
3. Variant editor 'Publish to' => accounts that cannot publish are marked '— cannot publish'; with no account a link to Settings appears
4. Staging after connecting LinkedIn with only w_member_social: the organisation rows show 'Your role on this page (…) cannot post' or 'connected but cannot publish (missing permission)'; member row notes LinkedIn does not share personal stats

> Tester note: Capabilities are derived from GRANTED scopes at connect time.

#### PUB-02 — WordPress connection: live probe before storing; https only; safeUrl

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser + integration · Local + configuration |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | A test WordPress site over https with an application password (staging or your own test site). |
| Start route / navigation | /app/settings/workspace → AccountsPanel → WordPress |
| Final expected state | Credential stored encrypted only after a successful probe. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Disconnect; revoke the application password in WP. |
| External access / cost / publication | Test WordPress site |
| Requirement IDs · route/action · resulting state | C-CNT-01 · /app/settings/workspace · accountConnectKey · CosConnection wordpress verified |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Site 'http://example.com' => refused (https only); Site 'https://127.0.0.1' or 'https://169.254.169.254' => refused (internal address)
2. Site 'https://<test-site>', user, wrong application password => 'could not verify' and nothing stored
3. Correct password => connection verified with capability publish (probe checks publish_posts); audit connection.verified
4. Publish an approved blog:article variant (PUB-09 on staging) => post appears with status publish; featured image attached

> Tester note: WordPress has no metrics adapter — Results says 'No numbers available' (site reporting = GA4).

#### PUB-03 — Retryable failure retries with backoff and reuses uploaded media

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser + background job · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) |
| Preconditions and test data | Scheduler running. Create a second test account via AccountsPanel with mode 'retryable_once' (dev only). |
| Start route / navigation | /app/content/<master id> → approved variant with an image |
| Final expected state | Max 4 attempts (2/4/8 min); providerMedia reused within 20 h; cleared on terminal failure. |
| Observable evidence | Attempt log; vitest. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-PUB-01 · /app/content/[id] · executePublication (retryable) · CosPublication.providerMedia; attemptCount |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Publish to the 'retryable_once' account, schedule +1 min => first tick: attempt 1 'retryable_failure' (503), publication back to scheduled with a 2-minute backoff; card shows the retry time
2. Second run (≥2 min later) => attempt 2 'success'; testAdapterLastMediaRefs shows the SAME media ref (no re-upload) — harness: completion-journey 'retries without re-uploading' passes
3. Attempt log => exactly 2 attempts; one post

#### PUB-04 — Uncertain outcome is parked, never retried; manual reconciliation

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser + background job · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) + owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Test account with mode 'uncertain'. |
| Start route / navigation | /app/content/<master id> |
| Final expected state | A person decides; nothing auto-retries an uncertain post. |
| Observable evidence | Screenshots; attempt rows. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-PUB-01 · /app/content/[id] · reconcilePublication, runDuePublications sweep · CosPublication uncertain→published/failed |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Schedule to the 'uncertain' account => tick: status uncertain; variant needs_review; staff notification 'publish_uncertain'; message 'The post may or may not be live — check the account before doing anything else'
2. Run 5 more ticks => no further attempts
3. Owner => cannot reconcile (staff only); Specialist: **I checked — it is NOT live** (confirm) => failed; variant failed and schedulable again
4. Repeat with another variant; **It is live** with an https evidence link => published with 'Confirmed live by a team member…'; master delivered
5. Stuck 'claimed' simulation: set a publication row claimedAt = now-20 min, status claimed => next tick parks it uncertain with 'Publishing was interrupted…'

#### PUB-05 — Partial thread keeps posted parts

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser + background job · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) |
| Preconditions and test data | Test account mode 'partial'; an approved 3-part x:thread. |
| Start route / navigation | /app/content/<master id> |
| Final expected state | Never starts a thread over. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-PUB-01 · /app/content/[id] · executePublication (partial) · CosPublication partial |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Schedule the thread to the 'partial' account => tick: status partial '1 of 3 part(s) are live'; partExternalIds contains one id
2. **I checked — it is NOT live** => refused ('Finish the thread by hand on the platform, then mark it live with the link')
3. **It is live** with a link => published

#### PUB-06 — Publish-time revalidation: kill switch, lost connection, changed content, definite failure

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser + background job · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed), specialist@growthos-demo.example.com (cgo_specialist, seed) |
| Preconditions and test data | Approved variant scheduled +3 min to the test account. |
| Start route / navigation | /app/settings/workspace → Kill switch |
| Final expected state | gateAction runs immediately before every external action. |
| Observable evidence | Attempt log outcomes. |
| Negative / alternate path | — |
| Cleanup | Kill switch off. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/content/[id], /app/settings/workspace · preflight, gateAction, setKillSwitch · CosPublishAttempt blocked/definite_failure |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Owner: **Stop all outbound** (confirm) => banner 'Kill switch is ON…'; message reports N scheduled items for manual review; tick => publication fails 'blocked' (Kill switch); variant failed; staff notification
2. Turn off; schedule again; specialist disconnects the account before the tick => publication cancelled immediately (CAL-02) — or, if only status changed to failed in DB: tick → 'is failed — reconnect it in Settings'
3. Schedule again; technical: change the variant's contentHash/version in DB (or edit via UI which cancels) => tick refuses 'The content changed after it was scheduled'
4. Test account mode 'definite' => attempt definite_failure (400) → failed; no retry
5. Approval expiry: set the approval's expiresAt in the past => gate 'Approval expired' → blocked

#### PUB-07 — Formats that cannot be automated say so; manual publication with link is first-class

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed), owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | An approved instagram:post variant with an image; no Meta connection. |
| Start route / navigation | /app/content/<master id> |
| Final expected state | Manual publication requires approval and an https evidence link. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-CNT-01 · /app/content/[id] · recordManualPublication · CosPublication adapter manual |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Publish to' => no Instagram account; message 'Publishing to Instagram is not available — publish manually and record the link.'
2. Owner tries **Record as published by hand** => not offered (staff only)
3. Specialist: **Record as published by hand** with Link 'http://insta…' => refused (https); with 'https://www.instagram.com/p/TEST123' => published, adapter manual, evidenceNote; master delivered
4. Un-approved variant: the manual button is absent; devtools submit => refused (gate still applies: 'manual is not a bypass')
5. Results → Content => the manual publication is excluded from metric sync and the page explains why

> Tester note: Instagram/Facebook photo locally also fails honestly because mediaOrigin() is null (needs https origin).

#### PUB-08 — Duplicate prevention and idempotency of scheduling

| Field | Value |
|---|---|
| Priority / type / environment | P0 · API/action (harness) · Local (dev-verify, http://localhost:3100) |
| Account and role | Tester |
| Preconditions and test data | Test DB. |
| Start route / navigation | PowerShell |
| Final expected state | Fixture-level proof of every adapter contract. |
| Observable evidence | Vitest output. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-CNT-02, C-CNT-03, C-CNT-04 · n/a · adapters · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. `npx vitest run tests/os/completion-journey.test.ts` => passes (published exactly once by the scheduler; media retry; cycle once)
2. `npx vitest run tests/os/completion-entry.test.ts -t "tick"` => passes (3 parallel ticks → one run; lease frees itself)
3. `npx vitest run tests/os/v2-adapters.test.ts tests/os/completion-adapters.test.ts` => pass (X chunked upload, thread media on first post only, LinkedIn multi-image/document/video with AVAILABLE polling, Facebook video handle+id reuse, analytics classification)

> Tester note: These are FIXTURE tests — not live verification.

#### PUB-09 — Publishing format: WordPress article + featured image (blog:article)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) (staging synthetic workspace) |
| Preconditions and test data | Staging with the provider connected on a Catalyst-owned TEST account (application password on a test site, check 9-style); an approved variant of format blog:article with media: 1 image (optional); explicit written authorisation to publish on that account. |
| Start route / navigation | /app/content/<master id> → variant card → Publishing |
| Final expected state | One live post; publication row published; metrics synced. |
| Observable evidence | External URL; attempt log screenshot; provider dashboard. |
| Negative / alternate path | PUB-03..PUB-08 |
| Cleanup | Delete the post on the platform; record the deletion. |
| External access / cost / publication | Provider app approval + test account; PUBLIC unless the account is private |
| Requirement IDs · route/action · resulting state | C-CNT-01 · /app/content/[id] · executePublication · CosPublication published; CosPublishAttempt success |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Publish to' lists the connected account with 'Can publish: yes' (AccountsPanel) => choose it
2. Media validation: attach the wrong kind/size => the card shows the deterministic problem before scheduling; fix it
3. **Schedule** for +2 minutes => scheduled; scheduler publishes => status published with external link; ONE attempt 'success' in the attempt log; liveVerifiedAt set on the connection
4. Open the external link => the article is live with the featured image
5. Run the tick again => no second post; attempt log unchanged
6. Next day: /app/results → Content => lifetime metrics rows labelled 'Synced from the platform' with the sync date; missing metrics shown as n/a

> Tester note: No metrics adapter for WordPress. Enable ONLY this format in production after this passes; a pass on one format does not enable the platform.

#### PUB-10 — Publishing format: X text post (x:post)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) (staging synthetic workspace) |
| Preconditions and test data | Staging with the provider connected on a Catalyst-owned TEST account (X paid tier with tweet.write; check 8); an approved variant of format x:post with media: 0–4 any; explicit written authorisation to publish on that account. |
| Start route / navigation | /app/content/<master id> → variant card → Publishing |
| Final expected state | One live post; publication row published; metrics synced. |
| Observable evidence | External URL; attempt log screenshot; provider dashboard. |
| Negative / alternate path | PUB-03..PUB-08 |
| Cleanup | Delete the post on the platform; record the deletion. |
| External access / cost / publication | Provider app approval + test account; PUBLIC unless the account is private |
| Requirement IDs · route/action · resulting state | C-CNT-01 · /app/content/[id] · executePublication · CosPublication published; CosPublishAttempt success |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Publish to' lists the connected account with 'Can publish: yes' (AccountsPanel) => choose it
2. Media validation: attach the wrong kind/size => the card shows the deterministic problem before scheduling; fix it
3. **Schedule** for +2 minutes => scheduled; scheduler publishes => status published with external link; ONE attempt 'success' in the attempt log; liveVerifiedAt set on the connection
4. Open the external link => the post exists once on the test account
5. Run the tick again => no second post; attempt log unchanged
6. Next day: /app/results → Content => lifetime metrics rows labelled 'Synced from the platform' with the sync date; missing metrics shown as n/a

> Tester note:   Enable ONLY this format in production after this passes; a pass on one format does not enable the platform.

#### PUB-11 — Publishing format: X image post (x:post+image)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) (staging synthetic workspace) |
| Preconditions and test data | Staging with the provider connected on a Catalyst-owned TEST account (X tier with media endpoints + media.write scope (NOTE: media.write is documented as needed but NOT in the requested scope string — expect a permission problem; record)); an approved variant of format x:post+image with media: 1 image; explicit written authorisation to publish on that account. |
| Start route / navigation | /app/content/<master id> → variant card → Publishing |
| Final expected state | One live post; publication row published; metrics synced. |
| Observable evidence | External URL; attempt log screenshot; provider dashboard. |
| Negative / alternate path | PUB-03..PUB-08 |
| Cleanup | Delete the post on the platform; record the deletion. |
| External access / cost / publication | Provider app approval + test account; PUBLIC unless the account is private |
| Requirement IDs · route/action · resulting state | C-CNT-01 · /app/content/[id] · executePublication · CosPublication published; CosPublishAttempt success |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Publish to' lists the connected account with 'Can publish: yes' (AccountsPanel) => choose it
2. Media validation: attach the wrong kind/size => the card shows the deterministic problem before scheduling; fix it
3. **Schedule** for +2 minutes => scheduled; scheduler publishes => status published with external link; ONE attempt 'success' in the attempt log; liveVerifiedAt set on the connection
4. Open the external link => the image post is live
5. Run the tick again => no second post; attempt log unchanged
6. Next day: /app/results → Content => lifetime metrics rows labelled 'Synced from the platform' with the sync date; missing metrics shown as n/a

> Tester note: Open question from code: X scope string lacks media.write (gap G-PUB-1). Enable ONLY this format in production after this passes; a pass on one format does not enable the platform.

#### PUB-12 — Publishing format: X thread (2 parts, media on first) (x:thread)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) (staging synthetic workspace) |
| Preconditions and test data | Staging with the provider connected on a Catalyst-owned TEST account (as PUB-11); an approved variant of format x:thread with media: 1 image; explicit written authorisation to publish on that account. |
| Start route / navigation | /app/content/<master id> → variant card → Publishing |
| Final expected state | One live post; publication row published; metrics synced. |
| Observable evidence | External URL; attempt log screenshot; provider dashboard. |
| Negative / alternate path | PUB-03..PUB-08 |
| Cleanup | Delete the post on the platform; record the deletion. |
| External access / cost / publication | Provider app approval + test account; PUBLIC unless the account is private |
| Requirement IDs · route/action · resulting state | C-CNT-01 · /app/content/[id] · executePublication · CosPublication published; CosPublishAttempt success |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Publish to' lists the connected account with 'Can publish: yes' (AccountsPanel) => choose it
2. Media validation: attach the wrong kind/size => the card shows the deterministic problem before scheduling; fix it
3. **Schedule** for +2 minutes => scheduled; scheduler publishes => status published with external link; ONE attempt 'success' in the attempt log; liveVerifiedAt set on the connection
4. Open the external link => both parts chained; media on the first only
5. Run the tick again => no second post; attempt log unchanged
6. Next day: /app/results → Content => lifetime metrics rows labelled 'Synced from the platform' with the sync date; missing metrics shown as n/a

> Tester note:   Enable ONLY this format in production after this passes; a pass on one format does not enable the platform.

#### PUB-13 — Publishing format: LinkedIn company text/image post (linkedin:post)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) (staging synthetic workspace) |
| Preconditions and test data | Staging with the provider connected on a Catalyst-owned TEST account (Community Management API approval; page ADMINISTRATOR; check 9); an approved variant of format linkedin:post with media: 0–1 image; explicit written authorisation to publish on that account. |
| Start route / navigation | /app/content/<master id> → variant card → Publishing |
| Final expected state | One live post; publication row published; metrics synced. |
| Observable evidence | External URL; attempt log screenshot; provider dashboard. |
| Negative / alternate path | PUB-03..PUB-08 |
| Cleanup | Delete the post on the platform; record the deletion. |
| External access / cost / publication | Provider app approval + test account; PUBLIC unless the account is private |
| Requirement IDs · route/action · resulting state | C-CNT-01, C-ANL-01 · /app/content/[id] · executePublication · CosPublication published; CosPublishAttempt success |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Publish to' lists the connected account with 'Can publish: yes' (AccountsPanel) => choose it
2. Media validation: attach the wrong kind/size => the card shows the deterministic problem before scheduling; fix it
3. **Schedule** for +2 minutes => scheduled; scheduler publishes => status published with external link; ONE attempt 'success' in the attempt log; liveVerifiedAt set on the connection
4. Open the external link => post visible once on the test page
5. Run the tick again => no second post; attempt log unchanged
6. Next day: /app/results → Content => lifetime metrics rows labelled 'Synced from the platform' with the sync date; missing metrics shown as n/a

> Tester note:   Enable ONLY this format in production after this passes; a pass on one format does not enable the platform.

#### PUB-14 — Publishing format: LinkedIn multi-image (2–20) (linkedin:multi_image)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) (staging synthetic workspace) |
| Preconditions and test data | Staging with the provider connected on a Catalyst-owned TEST account (as PUB-13); an approved variant of format linkedin:multi_image with media: 3 images; explicit written authorisation to publish on that account. |
| Start route / navigation | /app/content/<master id> → variant card → Publishing |
| Final expected state | One live post; publication row published; metrics synced. |
| Observable evidence | External URL; attempt log screenshot; provider dashboard. |
| Negative / alternate path | PUB-03..PUB-08 |
| Cleanup | Delete the post on the platform; record the deletion. |
| External access / cost / publication | Provider app approval + test account; PUBLIC unless the account is private |
| Requirement IDs · route/action · resulting state | C-CNT-01 · /app/content/[id] · executePublication · CosPublication published; CosPublishAttempt success |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Publish to' lists the connected account with 'Can publish: yes' (AccountsPanel) => choose it
2. Media validation: attach the wrong kind/size => the card shows the deterministic problem before scheduling; fix it
3. **Schedule** for +2 minutes => scheduled; scheduler publishes => status published with external link; ONE attempt 'success' in the attempt log; liveVerifiedAt set on the connection
4. Open the external link => all images shown
5. Run the tick again => no second post; attempt log unchanged
6. Next day: /app/results → Content => lifetime metrics rows labelled 'Synced from the platform' with the sync date; missing metrics shown as n/a

> Tester note:   Enable ONLY this format in production after this passes; a pass on one format does not enable the platform.

#### PUB-15 — Publishing format: LinkedIn document (PDF ≤100 MB) (linkedin:document)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) (staging synthetic workspace) |
| Preconditions and test data | Staging with the provider connected on a Catalyst-owned TEST account (as PUB-13); an approved variant of format linkedin:document with media: 1 PDF (2 pages); explicit written authorisation to publish on that account. |
| Start route / navigation | /app/content/<master id> → variant card → Publishing |
| Final expected state | One live post; publication row published; metrics synced. |
| Observable evidence | External URL; attempt log screenshot; provider dashboard. |
| Negative / alternate path | PUB-03..PUB-08 |
| Cleanup | Delete the post on the platform; record the deletion. |
| External access / cost / publication | Provider app approval + test account; PUBLIC unless the account is private |
| Requirement IDs · route/action · resulting state | C-CNT-01 · /app/content/[id] · executePublication · CosPublication published; CosPublishAttempt success |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Publish to' lists the connected account with 'Can publish: yes' (AccountsPanel) => choose it
2. Media validation: attach the wrong kind/size => the card shows the deterministic problem before scheduling; fix it
3. **Schedule** for +2 minutes => scheduled; scheduler publishes => status published with external link; ONE attempt 'success' in the attempt log; liveVerifiedAt set on the connection
4. Open the external link => document processed and viewable; title present
5. Run the tick again => no second post; attempt log unchanged
6. Next day: /app/results → Content => lifetime metrics rows labelled 'Synced from the platform' with the sync date; missing metrics shown as n/a

> Tester note: Adapter waits ~40 s for AVAILABLE; still-processing retries reuse the original upload URN. Enable ONLY this format in production after this passes; a pass on one format does not enable the platform.

#### PUB-16 — Publishing format: LinkedIn video (MP4 75 KB–500 MB) (linkedin:video)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) (staging synthetic workspace) |
| Preconditions and test data | Staging with the provider connected on a Catalyst-owned TEST account (as PUB-13); an approved variant of format linkedin:video with media: 1 MP4; explicit written authorisation to publish on that account. |
| Start route / navigation | /app/content/<master id> → variant card → Publishing |
| Final expected state | One live post; publication row published; metrics synced. |
| Observable evidence | External URL; attempt log screenshot; provider dashboard. |
| Negative / alternate path | PUB-03..PUB-08 |
| Cleanup | Delete the post on the platform; record the deletion. |
| External access / cost / publication | Provider app approval + test account; PUBLIC unless the account is private |
| Requirement IDs · route/action · resulting state | C-CNT-01 · /app/content/[id] · executePublication · CosPublication published; CosPublishAttempt success |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Publish to' lists the connected account with 'Can publish: yes' (AccountsPanel) => choose it
2. Media validation: attach the wrong kind/size => the card shows the deterministic problem before scheduling; fix it
3. **Schedule** for +2 minutes => scheduled; scheduler publishes => status published with external link; ONE attempt 'success' in the attempt log; liveVerifiedAt set on the connection
4. Open the external link => video plays
5. Run the tick again => no second post; attempt log unchanged
6. Next day: /app/results → Content => lifetime metrics rows labelled 'Synced from the platform' with the sync date; missing metrics shown as n/a

> Tester note:   Enable ONLY this format in production after this passes; a pass on one format does not enable the platform.

#### PUB-17 — Publishing format: LinkedIn personal profile post (linkedin:post (personal))

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) (staging synthetic workspace) |
| Preconditions and test data | Staging with the provider connected on a Catalyst-owned TEST account (w_member_social); an approved variant of format linkedin:post (personal) with media: 0–1 image; explicit written authorisation to publish on that account. |
| Start route / navigation | /app/content/<master id> → variant card → Publishing |
| Final expected state | One live post; publication row published; metrics synced. |
| Observable evidence | External URL; attempt log screenshot; provider dashboard. |
| Negative / alternate path | PUB-03..PUB-08 |
| Cleanup | Delete the post on the platform; record the deletion. |
| External access / cost / publication | Provider app approval + test account; PUBLIC unless the account is private |
| Requirement IDs · route/action · resulting state | C-CNT-01 · /app/content/[id] · executePublication · CosPublication published; CosPublishAttempt success |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Publish to' lists the connected account with 'Can publish: yes' (AccountsPanel) => choose it
2. Media validation: attach the wrong kind/size => the card shows the deterministic problem before scheduling; fix it
3. **Schedule** for +2 minutes => scheduled; scheduler publishes => status published with external link; ONE attempt 'success' in the attempt log; liveVerifiedAt set on the connection
4. Open the external link => post visible; Results shows manual entry required (personal analytics provider-restricted)
5. Run the tick again => no second post; attempt log unchanged
6. Next day: /app/results → Content => lifetime metrics rows labelled 'Synced from the platform' with the sync date; missing metrics shown as n/a

> Tester note: Analytics for personal posts are provider-restricted (r_member_social) → manual entry. Enable ONLY this format in production after this passes; a pass on one format does not enable the platform.

#### PUB-18 — Publishing format: Facebook Page text/photo post (facebook:post)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) (staging synthetic workspace) |
| Preconditions and test data | Staging with the provider connected on a Catalyst-owned TEST account (Meta App Review scopes; MEDIA_PUBLIC_ORIGIN set; check 10); an approved variant of format facebook:post with media: 0–1 image via signed link; explicit written authorisation to publish on that account. |
| Start route / navigation | /app/content/<master id> → variant card → Publishing |
| Final expected state | One live post; publication row published; metrics synced. |
| Observable evidence | External URL; attempt log screenshot; provider dashboard. |
| Negative / alternate path | PUB-03..PUB-08 |
| Cleanup | Delete the post on the platform; record the deletion. |
| External access / cost / publication | Provider app approval + test account; PUBLIC unless the account is private |
| Requirement IDs · route/action · resulting state | C-CNT-01, C-ANL-02 · /app/content/[id] · executePublication · CosPublication published; CosPublishAttempt success |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Publish to' lists the connected account with 'Can publish: yes' (AccountsPanel) => choose it
2. Media validation: attach the wrong kind/size => the card shows the deterministic problem before scheduling; fix it
3. **Schedule** for +2 minutes => scheduled; scheduler publishes => status published with external link; ONE attempt 'success' in the attempt log; liveVerifiedAt set on the connection
4. Open the external link => post and photo visible once
5. Run the tick again => no second post; attempt log unchanged
6. Next day: /app/results → Content => lifetime metrics rows labelled 'Synced from the platform' with the sync date; missing metrics shown as n/a

> Tester note:   Enable ONLY this format in production after this passes; a pass on one format does not enable the platform.

#### PUB-19 — Publishing format: Facebook Page video (facebook:video)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) (staging synthetic workspace) |
| Preconditions and test data | Staging with the provider connected on a Catalyst-owned TEST account (as PUB-18 + META_APP_ID); an approved variant of format facebook:video with media: 1 MP4 ≤500 MB; explicit written authorisation to publish on that account. |
| Start route / navigation | /app/content/<master id> → variant card → Publishing |
| Final expected state | One live post; publication row published; metrics synced. |
| Observable evidence | External URL; attempt log screenshot; provider dashboard. |
| Negative / alternate path | PUB-03..PUB-08 |
| Cleanup | Delete the post on the platform; record the deletion. |
| External access / cost / publication | Provider app approval + test account; PUBLIC unless the account is private |
| Requirement IDs · route/action · resulting state | C-CNT-01 · /app/content/[id] · executePublication · CosPublication published; CosPublishAttempt success |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Publish to' lists the connected account with 'Can publish: yes' (AccountsPanel) => choose it
2. Media validation: attach the wrong kind/size => the card shows the deterministic problem before scheduling; fix it
3. **Schedule** for +2 minutes => scheduled; scheduler publishes => status published with external link; ONE attempt 'success' in the attempt log; liveVerifiedAt set on the connection
4. Open the external link => video processed and live
5. Run the tick again => no second post; attempt log unchanged
6. Next day: /app/results → Content => lifetime metrics rows labelled 'Synced from the platform' with the sync date; missing metrics shown as n/a

> Tester note: OPEN QUESTION: the Resumable Upload step is documented with a USER token; the connector holds the PAGE token. If Meta refuses, record it — fix is to keep the user token for uploads. Enable ONLY this format in production after this passes; a pass on one format does not enable the platform.

#### PUB-20 — Publishing format: Instagram image post (instagram:post)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) (staging synthetic workspace) |
| Preconditions and test data | Staging with the provider connected on a Catalyst-owned TEST account (instagram_content_publish; professional account; check 10); an approved variant of format instagram:post with media: 1 image via signed link; explicit written authorisation to publish on that account. |
| Start route / navigation | /app/content/<master id> → variant card → Publishing |
| Final expected state | One live post; publication row published; metrics synced. |
| Observable evidence | External URL; attempt log screenshot; provider dashboard. |
| Negative / alternate path | PUB-03..PUB-08 |
| Cleanup | Delete the post on the platform; record the deletion. |
| External access / cost / publication | Provider app approval + test account; PUBLIC unless the account is private |
| Requirement IDs · route/action · resulting state | C-CNT-01, C-ANL-03 · /app/content/[id] · executePublication · CosPublication published; CosPublishAttempt success |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Publish to' lists the connected account with 'Can publish: yes' (AccountsPanel) => choose it
2. Media validation: attach the wrong kind/size => the card shows the deterministic problem before scheduling; fix it
3. **Schedule** for +2 minutes => scheduled; scheduler publishes => status published with external link; ONE attempt 'success' in the attempt log; liveVerifiedAt set on the connection
4. Open the external link => image live; caption links not clickable (warned)
5. Run the tick again => no second post; attempt log unchanged
6. Next day: /app/results → Content => lifetime metrics rows labelled 'Synced from the platform' with the sync date; missing metrics shown as n/a

> Tester note:   Enable ONLY this format in production after this passes; a pass on one format does not enable the platform.

#### PUB-21 — Publishing format: Instagram carousel (2–10) (instagram:carousel)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) (staging synthetic workspace) |
| Preconditions and test data | Staging with the provider connected on a Catalyst-owned TEST account (as PUB-20); an approved variant of format instagram:carousel with media: 3 images; explicit written authorisation to publish on that account. |
| Start route / navigation | /app/content/<master id> → variant card → Publishing |
| Final expected state | One live post; publication row published; metrics synced. |
| Observable evidence | External URL; attempt log screenshot; provider dashboard. |
| Negative / alternate path | PUB-03..PUB-08 |
| Cleanup | Delete the post on the platform; record the deletion. |
| External access / cost / publication | Provider app approval + test account; PUBLIC unless the account is private |
| Requirement IDs · route/action · resulting state | C-CNT-01 · /app/content/[id] · executePublication · CosPublication published; CosPublishAttempt success |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Publish to' lists the connected account with 'Can publish: yes' (AccountsPanel) => choose it
2. Media validation: attach the wrong kind/size => the card shows the deterministic problem before scheduling; fix it
3. **Schedule** for +2 minutes => scheduled; scheduler publishes => status published with external link; ONE attempt 'success' in the attempt log; liveVerifiedAt set on the connection
4. Open the external link => carousel live
5. Run the tick again => no second post; attempt log unchanged
6. Next day: /app/results → Content => lifetime metrics rows labelled 'Synced from the platform' with the sync date; missing metrics shown as n/a

> Tester note:   Enable ONLY this format in production after this passes; a pass on one format does not enable the platform.

#### PUB-22 — Publishing format: Instagram Reel (instagram:reel)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) (staging synthetic workspace) |
| Preconditions and test data | Staging with the provider connected on a Catalyst-owned TEST account (as PUB-20); an approved variant of format instagram:reel with media: 1 MP4 ≤900 s; explicit written authorisation to publish on that account. |
| Start route / navigation | /app/content/<master id> → variant card → Publishing |
| Final expected state | One live post; publication row published; metrics synced. |
| Observable evidence | External URL; attempt log screenshot; provider dashboard. |
| Negative / alternate path | PUB-03..PUB-08 |
| Cleanup | Delete the post on the platform; record the deletion. |
| External access / cost / publication | Provider app approval + test account; PUBLIC unless the account is private |
| Requirement IDs · route/action · resulting state | C-CNT-01 · /app/content/[id] · executePublication · CosPublication published; CosPublishAttempt success |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Publish to' lists the connected account with 'Can publish: yes' (AccountsPanel) => choose it
2. Media validation: attach the wrong kind/size => the card shows the deterministic problem before scheduling; fix it
3. **Schedule** for +2 minutes => scheduled; scheduler publishes => status published with external link; ONE attempt 'success' in the attempt log; liveVerifiedAt set on the connection
4. Open the external link => reel live; 'still processing' handled by polling
5. Run the tick again => no second post; attempt log unchanged
6. Next day: /app/results → Content => lifetime metrics rows labelled 'Synced from the platform' with the sync date; missing metrics shown as n/a

> Tester note:   Enable ONLY this format in production after this passes; a pass on one format does not enable the platform.

#### PUB-23 — Publishing format: YouTube long-form (private) (youtube:long_video)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) (staging synthetic workspace) |
| Preconditions and test data | Staging with the provider connected on a Catalyst-owned TEST account (Google OAuth with youtube.upload; check 11); an approved variant of format youtube:long_video with media: 1 MP4; explicit written authorisation to publish on that account. |
| Start route / navigation | /app/content/<master id> → variant card → Publishing |
| Final expected state | One live post; publication row published; metrics synced. |
| Observable evidence | External URL; attempt log screenshot; provider dashboard. |
| Negative / alternate path | PUB-03..PUB-08 |
| Cleanup | Delete the post on the platform; record the deletion. |
| External access / cost / publication | Provider app approval + test account; PUBLIC unless the account is private |
| Requirement IDs · route/action · resulting state | C-CNT-01 · /app/content/[id] · executePublication · CosPublication published; CosPublishAttempt success |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Publish to' lists the connected account with 'Can publish: yes' (AccountsPanel) => choose it
2. Media validation: attach the wrong kind/size => the card shows the deterministic problem before scheduling; fix it
3. **Schedule** for +2 minutes => scheduled; scheduler publishes => status published with external link; ONE attempt 'success' in the attempt log; liveVerifiedAt set on the connection
4. Open the external link => video present once as PRIVATE (uploads locked to private until API audit)
5. Run the tick again => no second post; attempt log unchanged
6. Next day: /app/results → Content => lifetime metrics rows labelled 'Synced from the platform' with the sync date; missing metrics shown as n/a

> Tester note: Single PUT resumable session (documented limitation). Enable ONLY this format in production after this passes; a pass on one format does not enable the platform.

#### PUB-24 — Publishing format: YouTube Short (≤180 s, private) (youtube:short)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) (staging synthetic workspace) |
| Preconditions and test data | Staging with the provider connected on a Catalyst-owned TEST account (as PUB-23); an approved variant of format youtube:short with media: 1 MP4; explicit written authorisation to publish on that account. |
| Start route / navigation | /app/content/<master id> → variant card → Publishing |
| Final expected state | One live post; publication row published; metrics synced. |
| Observable evidence | External URL; attempt log screenshot; provider dashboard. |
| Negative / alternate path | PUB-03..PUB-08 |
| Cleanup | Delete the post on the platform; record the deletion. |
| External access / cost / publication | Provider app approval + test account; PUBLIC unless the account is private |
| Requirement IDs · route/action · resulting state | C-CNT-01 · /app/content/[id] · executePublication · CosPublication published; CosPublishAttempt success |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'Publish to' lists the connected account with 'Can publish: yes' (AccountsPanel) => choose it
2. Media validation: attach the wrong kind/size => the card shows the deterministic problem before scheduling; fix it
3. **Schedule** for +2 minutes => scheduled; scheduler publishes => status published with external link; ONE attempt 'success' in the attempt log; liveVerifiedAt set on the connection
4. Open the external link => present once, /shorts/ URL
5. Run the tick again => no second post; attempt log unchanged
6. Next day: /app/results → Content => lifetime metrics rows labelled 'Synced from the platform' with the sync date; missing metrics shown as n/a

> Tester note:   Enable ONLY this format in production after this passes; a pass on one format does not enable the platform.

#### PUB-25 — Not implemented formats are labelled: Instagram Stories, LinkedIn polls/articles

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) |
| Preconditions and test data | None. |
| Start route / navigation | /app/content/<master id> → Add a channel version |
| Final expected state | Matrix matches lib/os/channels.ts. |
| Observable evidence | Screenshot of the select. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-CNT-05 · /app/content/[id] · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. The channel:format select offers exactly: x:post, x:thread, linkedin:post, linkedin:multi_image, linkedin:document, linkedin:video, facebook:post, facebook:video, instagram:post, instagram:carousel, instagram:reel, youtube:long_video, youtube:short, blog:article => no Stories/polls (not in the brief — deferred)

#### PUB-26 — Expired provider credentials and reconnect

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | owner@growthos-demo.example.com (owner, seed), specialist@growthos-demo.example.com (cgo_specialist, seed) |
| Preconditions and test data | A connected provider (staging). |
| Start route / navigation | /app/settings/workspace → Connections |
| Final expected state | Expired tokens fail fast and honestly. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Provider apps |
| Requirement IDs · route/action · resulting state | C-CNT-01 · /app/settings/workspace · recheckConnection, accessToken · CosConnection failed→verified |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Technical: set tokenExpiresAt in the past and remove the refresh token (or revoke access in the provider) => **Test** marks the connection failed with lastError; Results shows the broken-connection banner; /app/ops 'Connection issues' lists it
2. Schedule a publication to it => attempt 'definite' (token expired — reconnect), NOT retried; variant failed
3. Click **Connect** again => re-authorised; the same row is adopted (no duplicate connection for the same externalAccountId); access item resolves via syncAccessFromConnection

#### PUB-27 — Legacy 'Publish to {channel} now' on a work item

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) |
| Preconditions and test data | An approved content work item with a channel (linkedin) and the test account. |
| Start route / navigation | /app/work/<id> |
| Final expected state | No outdated endpoint remains. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/work/[id] · publishNow · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Click **Publish to linkedin now** (confirm) => goes through the same adapters/gate; blocked without approval; test adapter publishes; audit


### K. Analytics

#### ANL-01 — Results page: periods, empty and partial data, n/a never zero

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Seed: one published X post with synced test metrics (impressions 1200, link_clicks 48), one GA4 manual daily row (64 sessions yesterday), leads with and without attribution, one won opportunity. |
| Start route / navigation | /app/results |
| Final expected state | Missing = absent; sources labelled. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-ANL-04 · /app/results · metricsFor, businessOutcomes · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Tabs Business outcomes / Campaigns / Content; period **This week / This month / Last 30 days** => figures change; header says 'demo workspace: figures are synthetic'
2. Business outcomes => Enquiries 3, Qualified 1, Opportunities opened 2, Recorded sales one tile per currency (INR 85,000) with 'Amounts are never added across currencies'
3. Website sessions 64 (manual, labelled 'Entered by a team member' with the day); Search clicks 'n/a' with the caption that n/a is not zero; Website key events n/a
4. Content => the published post shows impressions/link_clicks 'Synced from the platform' and reach 'n/a'; manual publication rows explain no numbers
5. Switch to workspace C (no data) => empty states: 'No goals agreed yet → Open Growth Plan', 'No campaigns yet', 'Nothing published yet'

> Tester note: Never accept a '0' where no data exists.

#### ANL-02 — Lifetime vs daily, reach non-additive, mixed sources

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | Seed. |
| Start route / navigation | /app/results → 'Record or import numbers by hand' (staff) |
| Final expected state | Aggregation rules enforced. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-ANL-04 · /app/results · metricRecord (recordManualSnapshot) · CosMetricSnapshot |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Record Metric 'reach', Platform 'linkedin', Value 500, Kind 'Running total as of that day', Day today, Campaign 'Consult First', Confidence B => saved; record reach 700 for tomorrow's date? (future refused?) — use yesterday 500 and today 700 => campaign total shows the LATEST lifetime value (700) not 1200; reach is not included in campaign totals note 'Totals add platform-reported counts…'
2. Record 'impressions' daily 100 on two days => period total 200 (additive)
3. Record the same (provider, metric, kind, day) again with 150 => upsert replaces, no double count
4. Mixed: one metric with api and manual rows in the range => label 'Mixed sources'
5. Record a money metric without currency => refused; negative value => refused; unknown metric => refused

#### ANL-03 — CSV import of metrics with per-row errors

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | Prepare CSV lines: `date,provider,metric,kind,value,campaign_code` with 3 good rows, one bad date, one unknown metric, one negative value. |
| Start route / navigation | /app/results → Import CSV |
| Final expected state | Partial import keeps good rows. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-ANL-04 · /app/results · metricImport · CosMetricSnapshot source import |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Paste and **Import** => summary: 3 imported, 3 errors listed with row numbers; good rows visible; over 2000 rows => refused

#### ANL-04 — Attribution: known / self_reported / unknown; never inferred

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Seed leads Ravi, Neha (utm_content = published post id), Imran (no UTM). |
| Start route / navigation | /app/leads/<Ravi> |
| Final expected state | Single-touch at capture; frozen on opportunities. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-03 · /app/leads/[id], /app/results · attributionFor · LosLead.attributionKind |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Provenance => attribution 'known' with campaign 'Consult First' and the post; Imran => 'unknown'; nothing infers a source
2. Submit the public form with utm_campaign = a code from ANOTHER workspace => lead attribution stays unknown (foreign tags never trusted)
3. Submit with utm_content = a variant id of this org => known
4. Results → Campaigns => 'Consult First' shows 2 enquiries attributed; the copy contains no causal claims

#### ANL-05 — Opportunities and recorded sales by the client

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed), lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | Lead Neha with a qualified opportunity. |
| Start route / navigation | /app/leads/<Neha> → LeadOutcomes panel |
| Final expected state | Money per currency; client records outcomes. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-03 · /app/leads/[id] · opportunityCreate, opportunityStatus · CosOpportunity won |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Owner: set status 'won' without amount/currency/close date => refused; with ₹120,000 INR today => won; Results 'Recorded sales' INR tile updates
2. Lead@ tries to record an outcome => refused (leads.edit is client-only) — 'Sales outcomes are recorded by the client'
3. Create an opportunity in USD and win it => a separate USD tile; never summed with INR

#### ANL-06 — Metric sync job: verified connection with analytics capability only; stale/failed sync

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Background job · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | Published test publication; scheduler running. |
| Start route / navigation | Wait a tick |
| Final expected state | No sync from unverified connections; never zero. |
| Observable evidence | Screenshots; tick output. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Scheduler |
| Requirement IDs · route/action · resulting state | C-ANL-04 · /app/results, /admin/os · enqueueMetricSyncs, syncPublicationMetrics · LosJob; CosMetricSnapshot |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Tick enqueues one metric job per published non-manual publication per day => Results shows synced date; run 3 ticks => no duplicate rows (idempotent key per day)
2. Set the test connection status to 'failed' (DB) => next sync writes 0 rows; Results banner 'failed… numbers from these accounts are not updating. Reconnect'; /admin/os → dead/stuck jobs remain 0
3. Restore

#### ANL-07 — GA4 and Search Console: separate metrics, timezone/date ranges, reconciliation

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Google OAuth configured; a GA4 property and a Search Console site the tester owns (check 12). |
| Start route / navigation | /app/settings/workspace → Google Search Console → Connect |
| Final expected state | Sessions ≠ clicks; ranges DST-correct. |
| Observable evidence | Screenshots side by side with the provider UI. |
| Negative / alternate path | — |
| Cleanup | Disconnect. |
| External access / cost / publication | Google OAuth client |
| Requirement IDs · route/action · resulting state | C-ANL-04 · /app/settings/workspace, /app/results · syncSearchConsole, syncGa4 · CosMetricPoint; CosMetricSnapshot |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Connect => verified sites listed; set GA4 property id (5–15 digits) in AccountsPanel => saved; invalid id refused
2. **Sync now** => Search Console daily clicks/impressions for 28 days with a 2-day lag (CosMetricPoint grade B)
3. Wait a tick => GA4 sessions/keyEvents by campaign code (28 days to yesterday) in CosMetricSnapshot
4. Results => 'Website sessions' and 'Search clicks' are separate figures; open the provider dashboards for the same date range and compare (allow the 2-day lag and provider timezone); record deltas
5. Change the period to 'This week' => Monday-start week in the workspace zone

#### ANL-08 — AI narratives grounded in facts (reports and performance summary)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · API/action (harness) + browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Tester + owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Test DB. |
| Start route / navigation | PowerShell |
| Final expected state | Narratives never invent numbers. |
| Observable evidence | Vitest; screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Real model |
| Requirement IDs · route/action · resulting state | C-ANL-05 · /app/studio/performance_summary, /app/reports/notes · groundedNarrativeRaw, inventedNumbers · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. `npx vitest run tests/os/v2-rules.test.ts -t "narrative"` (or the AI validator tests) => passes (numbers not in facts discard the narrative)
2. Browser: AI-17 output → every number appears in /app/results for the period; 'not available' for nulls; no cause/effect language

> Tester note: Wording varies between runs; only the number set and absence of causal claims are checked.

#### ANL-09 — Lead reports (LeadOS) tiles and demo exclusion

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Seed. |
| Start route / navigation | /app/reports |
| Final expected state | Read-only. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/reports · rollupOrgDay · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Tiles New leads, Delivered (quota), Contact rate, Conversion rate, Form views → submits, Messages sent, Tokens used, Pipeline won => populated; 'New leads per day', 'Leads by source', 'Lost reasons' sections
2. Workspace C => 'No data yet.' empty states
3. Note: the header claims 'owners get this as a weekly email every Monday' — that is the LeadOS digest; verify only with Resend on staging (NOTF-03)


### L. CRM

#### LEAD-01 — Manual lead creation with lawful use; dedupe

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside. |
| Start route / navigation | /app/leads/new |
| Final expected state | One lead per normalised contact per (org, type). |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Delete test leads (soft). |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/leads/new · createLeadManual (createLead) · LosLead |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Lead type B2C, First name 'Test', Email 'lead-1@growthos-test.example.com', no purposes ticked => **Create lead** refused (lawful use required for B2C)
2. Tick purposes sales_contact + channels email, evidence 'Enquiry form 2026-09' => created; redirected to the lead
3. Create again with the same email => 'duplicate' message pointing at the existing lead; no second row
4. B2B: Company 'Acme Robotics', website 'https://acme.example', email 'cto@acme.example' => created; company find-or-create by domain (second B2B lead with the same domain shares the company)
5. Email 'not-an-email' and phone empty => refused (one valid contact point required)

> Tester note: Gmail dots/plus are preserved deliberately.

#### LEAD-02 — CSV import: mapping, B2C lawful use, limits, report

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser + background job · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Prepare a 20-row synthetic CSV (name,email,phone,city) with 2 duplicates, 2 invalid emails, one column 'Religion'. Scheduler/queue running. |
| Start route / navigation | /app/leads/import |
| Final expected state | Idempotent commit (status claim); report JSON. |
| Observable evidence | Import report screenshot. |
| Negative / alternate path | — |
| Cleanup | Delete imported leads or leave (demo org). |
| External access / cost / publication | Scheduler |
| Requirement IDs · route/action · resulting state | n/a · /app/leads/import, /app/leads/import/[id] · uploadImport, saveImportMapping, commitImport · LosImport previewed→committing→done |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. 'These are… B2C', choose the CSV, **Upload & map columns** => /app/leads/import/<id> with suggested mapping
2. Map 'Religion' => refused as a sensitive field name; leave unmapped
3. Save mapping without Email or Phone mapped => refused; B2C without purposes/channels/evidence => refused; fill and **Save mapping & preview** => preview rows
4. **Run import** => 'Importing… This page refreshes automatically.'; after the queue runs: Import report accepted 16, duplicates 2, invalid 2 with row numbers; **View leads →**
5. Upload a 9 MB file / 10,001 rows / an .xlsx => refused with the limit named

> Tester note: Commit runs in the LeadOS job queue drained by /api/os/tick (and /api/leados/cron).

#### LEAD-03 — Lead detail: status, owner, notes, tasks, delete (soft)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed), sales_rep member |
| Preconditions and test data | Invite 'rep-1@growthos-test.example.com' as sales_rep and accept. |
| Start route / navigation | /app/leads/<id> |
| Final expected state | Activities logged; soft delete. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/leads/[id], /app/pipeline, /app/tasks · setLeadStatus, assignLead, addNote, addTask, deleteLead · LosLead status; LosTask |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Owner: Owner select → rep-1 => status auto 'assigned'; rep-1 sees it in /app/tasks 'Waiting for first contact'
2. Status → 'lost' => prompt 'Lost reason?' required; → 'converted' => prompt for conversion value; convertedAt stamped
3. Add note '@rep-1@growthos-test.example.com please call' => note with mention; Add task 'Call back' due tomorrow assignee rep-1 => appears in rep-1's My day; **Done** toggles
4. rep-1 tries **Delete lead** => not offered (leads.delete is owner/admin); owner deletes (confirm) => gone from lists; 'recoverable by support' (deletedAt)
5. Kanban /app/pipeline: drag a lead to 'Qualified' => status changes; drag to Lost => reason prompt

> Tester note: Status changes dispatch trigger.lead_stage_changed to workflows.

#### LEAD-04 — Outreach: consent gate, suppression, caps, one-to-one and sequences

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Lead with permitted channel email only (LEAD-01). Twilio/Resend unset → dev_logged transport. |
| Start route / navigation | /app/leads/<id> → messages tab |
| Final expected state | No bulk path; every send passes decideUse + suppression + caps. |
| Observable evidence | Recent sends list with block reasons. |
| Negative / alternate path | — |
| Cleanup | Kill switch off. |
| External access / cost / publication | Twilio/Resend for real transport |
| Requirement IDs · route/action · resulting state | n/a · /app/leads/[id], /app/outreach, /app/u/[token] · sendOneToOne, createSequence, enrollInSequence, handleOptOut · LosOutboundMessage sent/blocked |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Channel select => WhatsApp/SMS show '(no consent)' and are disabled; Email enabled; Template optional; **Send** 'Hi {{firstName}}…' => message recorded (dev_logged) with the opt-out footer link
2. Devtools: force channel 'whatsapp' => blocked with reason 'channel_not_permitted' recorded in messages
3. Send 4 emails to the same lead today => the 4th blocked (daily cap per lead = 3)
4. Suppress the contact (ENTRY-07) => any send blocked 'suppressed'
5. /app/outreach: create Template 'Follow-up 1' (email), Sequence with 2 steps delays 24 h/48 h => enrol the lead from the lead page => enrollment shown; sequence pauses on reply/opt-out (technical: POST /api/leados/webhooks/twilio needs signature; email opt-out via /app/u/<token> => 'You're unsubscribed' and the sequence stops)
6. Kill switch ON (PUB-06) => sends blocked with reason kill_switch

#### LEAD-05 — Lead export (B2B only) and API keys

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser + API · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | B2B and B2C leads exist. |
| Start route / navigation | /app/leads |
| Final expected state | Keys hashed at rest; rate-limited; entitlement-gated. |
| Observable evidence | curl outputs. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/leads, /app/settings/api-keys, /api/v1/leads · exportLeadsCsv, createApiKey, revokeApiKey · LosApiKey |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. **Export B2B** => CSV download with only B2B rows; a cell starting with '=' is escaped (CSV-injection safe); audit leads.export {count}
2. As analyst => Export refused inline (leads.export)
3. /app/settings/api-keys → **Create key** 'Zapier test' => secret shown once (los_…); `curl -H "Authorization: Bearer <key>" http://localhost:3100/api/v1/leads?limit=5` => 200 JSON with cursor; POST a lead with `Idempotency-Key: abc123` twice => same lead id, `idempotent:true` on the second; a duplicate email => 200 `duplicate:true`
4. **Revoke** the key (confirm) => curl → 401; 121 requests in a minute → 429 with Retry-After

#### LEAD-06 — B2B Discover: search, reveal debits tokens once, exclusions

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) + Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | Operator: upload and approve a small synthetic B2B dataset (OPS-08) so inventory exists; grant 100 tokens (CRD-11). |
| Start route / navigation | /app/discover |
| Final expected state | Reveal debits tokens; refusals are messages. |
| Observable evidence | Screenshots; billing ledger. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-REL-02 · /app/discover · runSearch, previewReveal, doReveal · LosTokenLedger reveal_debit |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Filters Keyword/Job title/Country → **Search** => masked results (no emails/phones) with quality
2. Select 2 rows → **Preview cost** => cost in tokens; **Confirm reveal** => contacts revealed; token balance decreases once; reveal again => no second debit (idempotent)
3. With balance 0 => 'Not enough tokens' and nothing revealed (no partial debit)
4. **Save search** with alert => listed; add Excluded domain 'acme.example' => results exclude it
5. As analyst: **Preview cost** => refusal alert (leads.edit), never empty data

#### LEAD-07 — Managed deliveries: plan, preview, execute, replacement

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser + background job · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) + owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Approved B2C dataset with purposes (OPS-08); Brightside tokens ≥ 100. |
| Start route / navigation | /admin/leados/plans |
| Final expected state | Allocation transactional and idempotent per day. |
| Observable evidence | Preview JSON; ledger. |
| Negative / alternate path | — |
| Cleanup | Pause the plan. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /admin/leados/plans, /app/deliveries · previewPlanAllocation, executePlanAllocation, requestReplacement, decideReplacement · LosAllocationRun; LosLeadReplacement |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Create plan: org Brightside, 'Daily 3', B2C, quota 3, working days Mon–Fri, purpose sales_contact, minQuality 0 => created; **Preview** for today => counts + reasons, nothing written
2. **Execute** => 3 leads delivered; tokens debited; execute again today => 'already_executed' (idempotent)
3. Owner /app/deliveries => plan card with run chips, delivered leads; **Request replacement** on one with reason => allocation replacement_requested
4. Operator: replacement queue → approve => tokens credited back (replacement_credit); reject → rejected
5. A suppressed contact in inventory is never allocated (reason 'suppressed' in preview)

> Tester note: Blueprint §23 slice.

#### LEAD-08 — Scoring weights and stages

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside. |
| Start route / navigation | /app/settings/scoring |
| Final expected state | Rule-based scoring only. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | Reset defaults. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/settings/scoring · saveScoringWeights · LosScoringConfig |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Set 'Has an email' 150 => clamped to 100 on save; Hot ≥ 70, Warm ≥ 40 => pipeline badges hot/warm/cold update on the next score
2. As analyst => weights read-only (needs pipeline.manage)


### L. Workflows

#### WF-01 — Workflow builder: template, validation, save drops activation, staff cannot activate

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) then owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside (automations module via active contract). |
| Start route / navigation | /app/workflows |
| Final expected state | Only the activated definition runs. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/workflows/[id] · saveCanvas, workflowStatus (activate) · CosWorkflow activeHash |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Lead: **Use template** 'New lead → notify team' (or any CRM template) => /app/workflows/<id> Builder with nodes; badge 'Draft · not active'
2. Add a second trigger node and Save => problem 'exactly one trigger'; connect a node back to an earlier one => 'Steps loop back on themselves'; add a condition with two Yes edges => refused; fix
3. Lead: **Activate** => refused/absent ('A workspace owner or admin activates it.'); staff never hold automations.activate
4. Owner: **Activate** (confirm names contact/external steps) => Active; the definition hash is stored
5. Lead: move a node on the canvas and save => still Active (position not in hash); change a condition value and save => drops to 'Draft · not active' with a message; owner re-activates
6. Create 51 workflows => the 51st refused (MAX_WORKFLOWS 50) — optional

#### WF-02 — Triggers, conditions, branches, waits, loop prevention, kill switch, logs redaction

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser + background job · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Active workflow: trigger lead_created → condition city equals 'Pune' → Yes: create task; No: add note → wait 1 minute → notify team (email members). Scheduler running. |
| Start route / navigation | /app/leads/new |
| Final expected state | Deterministic engine with fail-closed conditions. |
| Observable evidence | Run log screenshots. |
| Negative / alternate path | — |
| Cleanup | Pause the workflow. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/workflows/[id] · emitEvent, executeRun, tickWorkflows · CosWorkflowRun waiting/completed/blocked/failed; CosWorkflowStepLog |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Create a lead in Pune => Run log shows a run: condition true branch, task created; run waiting at the wait node; after the tick (≥1 min) resumes and the notify step logs 'email members' (dev-logged)
2. Create a lead in Mumbai => No branch; note added
3. Run log entries => emails/phones are redacted (no PII in step logs)
4. Edit the workflow while a run is waiting (changes the hash) => on resume the run ends 'blocked' (definition changed)
5. Kill switch ON => new events do not dispatch; a resumed run stops with a 'blocked' step; off again
6. Loop: a workflow whose action moves the lead stage and whose trigger is lead_stage_changed => depth capped at 3 (runs stop cascading); confirm ≤3 chained runs
7. **Run now** twice quickly => manual trigger events; daily cap 2000 not reached
8. Step failure (HTTP request node to https://httpstat.us/500) => run 'failed'; no per-step retry (by design)

> Tester note: Unknown operators fail closed; waits clamp 1 min–60 days.

#### WF-03 — Inbound webhook trigger and outbound connections (safeUrl)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · API + browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Workflow with trigger.webhook active. |
| Start route / navigation | /app/workflows/<id> → Webhook address |
| Final expected state | Token is the credential (hashed); SSRF guarded. |
| Observable evidence | curl outputs; run log. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · POST /api/os/hooks/[token], /app/workflows/connections · newHookAddress, connectKey, safeUrl · CosWorkflowHook |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. **Generate address** => URL shown ONCE with token; `curl -X POST <url> -H 'Content-Type: application/json' -d '{"name":"x"}'` => 200 and a run; wrong token => identical 200-style response, no run; same body within a minute => idempotent (one run)
2. **Generate a new address** (confirm) => old URL stops working
3. HTTP request node with URL 'http://10.0.0.1/' or 'https://169.254.169.254/' => refused by safeUrl; redirects are not followed
4. /app/workflows/connections: **Connect** Slack/Telegram-style key => stored; **Disconnect** (confirm) => workflows using it fail until reconnected; activation requires every needed connection verified

> Tester note: Clients never run code on our servers: no code/shell/SQL blocks exist in the catalog (verify the node palette).

#### WF-04 — Workflow message-to-lead goes through outreach rules

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Workflow: lead_created → message the lead (email). |
| Start route / navigation | /app/leads/new |
| Final expected state | sendOutreachMessage is the only path. |
| Observable evidence | Run log; Recent sends. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/workflows/[id] · blocks message_lead · CosWorkflowRun blocked |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Create a B2C lead WITHOUT email consent => run ends 'blocked' (no consent), no message; with consent => message dev-logged with opt-out footer
2. Suppressed lead => blocked


### M. Partner

#### PTR-01 — Partner application: steps, honeypot, duplicates, status page

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Visitor |
| Preconditions and test data | ENTRY-08 draft exists. |
| Start route / navigation | /partners/apply?t=<token> |
| Final expected state | PartnerApplication applied with score + duplicateFlags; audit row; NO email sent. |
| Observable evidence | Admin queue screenshot. |
| Negative / alternate path | — |
| Cleanup | Reject the extra applications. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /partners/apply, /partners/apply/status/[token] · saveStep, submitApplication · PartnerApplication applied |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Step 1 required: Full name, Email, Phone, Country, City => **Continue** with Phone empty → refused
2. Steps 2–4: fill track record, pipeline numbers (e.g. 500 prospects → clamped to 9999 max), Markets 'India', Families, Hours 10 => **Submit application** => /partners/apply/status/<token> with plain-language copy (no score/band shown)
3. Open the status link again => same; 'Finish your application' absent (already submitted)
4. Fill the hidden honeypot 'company_website_confirm' via devtools on a second draft and submit => success shown but the application stays unsubmitted (admin queue does not show it)
5. Submit a third application with the same email => allowed; admin queue shows a 'duplicate' badge (flagged, never blocked)
6. 6 first-saves within an hour from one IP => rate limited

> Tester note: Acknowledgement email is manual (admin copies the generated text).

#### PTR-02 — Admin review: request info, applicant edit link, approve → partner + rate

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) (admin) then Visitor |
| Preconditions and test data | PTR-01. |
| Start route / navigation | /admin/partners/applications |
| Final expected state | Partner user exists with an approved 30% rate. |
| Observable evidence | Screenshots (mask the password). |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /admin/partners/applications/[id] · requestInfo, submitRequestedInfo, approveApplication, rejectApplication · Partner; CommissionRate |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. View chips (All / Fast-track / …) and filters => the application listed with Score/Band => **Review**
2. **Request more information**: tick 'LinkedIn profile', message => status waiting_on_applicant; the edit link /partners/apply/edit/<token> lets the applicant edit ONLY that field; other fields absent; submit => rescored
3. **Approve**: Partner legal name, Commission rate 30, Reason, Markets India, Families, Protection days 90, Quote threshold => **Approve and create partner** => one-time password shown ONCE (copy it); partner record created; 'Open partner record'
4. Approve with rate 35% => stored unapproved pending a SECOND admin (two-admin rule); the same admin cannot approve it
5. Reject another application: Reason code + note => rejected; status page copy stays plain

> Tester note: Password delivery is manual. Partner agreement signature is offline; status pending_agreement until an admin sets active.

#### PTR-03 — Partner login, status gating, dashboard

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | partner-test@growthos-test.example.com (partner, approved in PTR-02) |
| Preconditions and test data | PTR-02 one-time password. |
| Start route / navigation | /partner/login |
| Final expected state | partner_session cookie (7 days). |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /partner, /partner/login, /admin/partners/[id] · POST /api/partner/login, changePartnerStatus · Partner.status |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Wrong password => 'Invalid email or password.'; correct => /partner Dashboard tiles Payable now / Accrued / Pipeline value / Action needed; per-currency lines (INR and USD never summed); standing line 'Commission is paid on the onboarding fee only…'
2. Status pending_agreement banner on /partner/earnings; admin sets status 'active' (Reason required) => banner gone
3. Admin sets 'suspended' => registering a deal is refused ('invalid'); set back to active
4. Open /partner while signed out => /partner/login; /admin/partners as partner => redirected (no staff role)

#### PTR-04 — Deal registration: identity key, house account, duplicate/protection matrix

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | partner-test@growthos-test.example.com (partner, approved in PTR-02) + second partner |
| Preconditions and test data | Approve a second partner 'partner-two@growthos-test.example.com' (PTR-02). Seed the price book: `npm run seed:price-book`. |
| Start route / navigation | /partner/deals/new |
| Final expected state | Deal registered/protected; flat refusals. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /partner/deals/new, /partner/deals/[id] · registerDealAction, logActivityAction, setDealStage · Deal registered; protectedUntil |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Partner 1: Client legal name 'Acme Clinic Pvt Ltd', Website 'https://www.AcmeClinic.example/?utm=1', Market India, family, tier T2, expected close => registered; 'Protected until' = +90 days; identity normalised to acmeclinic.example
2. Partner 1 registers 'https://acmeclinic.example' again => 'your_own_deal' refusal
3. Partner 2 registers the same domain => 'already_registered' (flat message, no owner revealed)
4. Partner 2 registers 'instagram.com/acmeclinic' => treated as a distinct handle-based key (not collapsed to instagram.com) — record
5. No-website deal: tick 'no website', phone '+91 98765 43210' => key phone:8765432100; displays 'no website — identified by phone ending 3210'
6. Admin marks a Client isHouseAccount (DB or admin UI if present) => registration refused 'This account is managed directly by Catalyst.'
7. Log an activity (Call) => protection extended by 30 days, capped at 180 from registration; move stage to 'Proposal sent' => cap lifted

> Tester note: Stage 'lapsed' is documented but no code sets it (gap G-PTR-1): protection expiry never frees an account automatically.

#### PTR-05 — Quote from price book; custom price request; win locks the rate

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | partner-test@growthos-test.example.com (partner, approved in PTR-02) + Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | PTR-04 deal; price book seeded. |
| Start route / navigation | /partner/deals/<id>/quote |
| Final expected state | One door for money; rate frozen at win. |
| Observable evidence | Screenshots; commission ledger. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /partner/deals/[id]/quote, /admin/partners/deals · selectPackage, requestCustomPrice, setCustomPrice, winDeal · Deal won; Commission pending |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Family select → package cards from the price book (market-matched) => **Save** => deal fee = the book's onboarding fee; 'Your commission on this deal' shows Base, Rate 30%, You earn (integer minor units, half-up)
2. Devtools: change the priceBookId to a US-market row => refused (market mismatch)
3. **Request a custom price** 12000 with a 5-char reason => refused (≥10); with a proper reason => request recorded; deal money unchanged
4. Admin /admin/partners/deals: **Approve** the request => fee set from the DB amount; partner quote page now read-only 'Custom price — set by Catalyst'; **Decline** path requires a ≥10-char reason fed to the activity feed
5. Partner: Mark won without a package => disabled; with fee: **Mark won** => stage won; commission pending with rateBp locked; admin changes the partner's rate to 25% afterwards => the won deal's commission unchanged

> Tester note: Growth Plan monthly is never commissionable (not copied to the deal).

#### PTR-06 — Commission lifecycle: invoice, pro-rata collections, payout, adjustments, void

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) (finance) + partner-test@growthos-test.example.com (partner, approved in PTR-02) |
| Preconditions and test data | PTR-05 won deal with a pending commission (e.g. base ₹100,000 → ₹30,000). |
| Start route / navigation | /admin/partners/commissions |
| Final expected state | Ledger sums; only three adjustment reasons. |
| Observable evidence | Ledger screenshots; CSV. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /admin/partners/commissions · recordInvoiceAction, recordCollectionAction, markPaidAction, createAdjustmentAction, voidCommissionsAction · Commission pending→accrued→payable→paid; adjusted; void |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. **Record invoice** on the deal => commission accrued
2. **Record collection** 40% of the invoice => a payable slice = 40% of the entitlement (₹12,000); another 40% => ₹12,000; final 20% => remaining ₹6,000 (slices sum exactly); over-collection => refused
3. **Mark paid** without payout reference => refused; with 'PAYOUT-2026-10' => paid; partner dashboard 'Payable now' drops, activity shows
4. **Adjustment** reason 'retention' => refused ('There is no retention clawback.'); reason 'refund' amount ₹5,000 => a negative counter-row 'adjusted'; magnitude above the original => refused
5. **Void** on a not-yet-paid commission (deal cancelled pre-delivery) => void
6. **Export CSV** => file with minor-unit decimals; as a partner session hitting /api/admin/partners/commissions/export => 403
7. Partner /partner/earnings => shows only the current rate number (no history/reasons)

> Tester note: Payout day is a convention (1st), not software; payment itself is manual.

#### PTR-07 — Won deal → workspace provisioning (attribution into GrowthOS)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | PTR-05 won deal not yet linked. |
| Start route / navigation | /admin/os → New workspace |
| Final expected state | One engagement per partner deal. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Demo-flagged → wiped by SETUP-05. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /admin/os · provisionWorkspace · CosEngagement.partnerDealId |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Partner-deal select lists the won deal => choose it, Name 'Acme Clinic (test)', owner email 'owner-acme@growthos-test.example.com', tick 'Demo workspace (wipeable)' => workspace + engagement with entrySource 'partner' and partnerDealId; invite link logged
2. Submit the same form again with the same deal => returns the existing workspace (no duplicate; partnerDealId unique)
3. /admin/os/<org> New engagement with the same partnerDealId => refused/returns existing
4. Partner portal => the partner sees nothing of the workspace (only their deal)

> Tester note: Whether a won deal should auto-create the workspace is an OWNER decision (today manual).

#### PTR-08 — Partner isolation and permitted client visibility

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | partner-test@growthos-test.example.com (partner, approved in PTR-02) (partner two) |
| Preconditions and test data | Two partners with deals. |
| Start route / navigation | /partner/deals |
| Final expected state | Same generic response for missing vs foreign. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /partner/deals/[id] · assertOwns · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Partner two opens partner one's deal URL => 'Deal not found' (generic); quote URL => same
2. Partner two's dashboard tiles => only own deals/commissions
3. Partner cannot see rate history, other partners, or any GrowthOS workspace data

#### PTR-09 — Refund/cancellation effect on commissions and engagement

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | PTR-06 paid commission; the client later refunded (manual business event). |
| Start route / navigation | /admin/partners/commissions |
| Final expected state | Documented, software-supported refund handling; no retention clawback. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /admin/partners/commissions · createAdjustmentAction · Commission adjusted |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Create an adjustment reason 'refund' for the refunded portion => negative row; ledger totals reflect it; the original row untouched
2. A client cancelling the monthly Growth Plan => NO adjustment is possible (by rule) — confirm the UI offers no such reason

> Tester note: Manual business process: deciding the refund itself.


### N. Notifications

#### NOTF-01 — In-app notifications: recipients, dedupe, mark read

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed), lead@growthos-demo.example.com (cgo_lead, seed), specialist@growthos-demo.example.com (cgo_specialist, seed) |
| Preconditions and test data | Seed. |
| Start route / navigation | /app/dashboard |
| Final expected state | CosNotification rows with unique dedupeKey. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/dashboard, /app/ops · notify, markRead · CosNotification |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Lead moves a variant to client_review => owner's Home badge +1 and 'Updates' lists 'approval_requested'; lead@ and specialist@ do NOT see it (client audience)
2. Owner rejects => the variant OWNER (specialist) sees 'revision_requested'; owner's approval notice auto-cleared
3. Trigger the same event twice (e.g. two ticks of a renewal) => one notice (dedupeKey)
4. **Mark read** on one => badge decrements; /app/ops **Mark all read** (staff) => zero
5. Analyst (client) => sees client-audience notices too (audience-wide) — record

> Tester note: There is no email for publish/approval notifications (in-app only) and no opt-out except low balance — gap G-NOTF-1 if emails are expected.

#### NOTF-02 — Transactional emails: captured transport locally; links work

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Tester |
| Preconditions and test data | RESEND_API_KEY unset. |
| Start route / navigation | Dev server console |
| Final expected state | No email leaves the machine locally. |
| Observable evidence | Console lines (redact tokens). |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · n/a · lib/leados/email.ts · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Trigger: invite (AUTH-05), password reset (AUTH-03), privacy verify (ENTRY-09), low-balance (CRD-04), team notify workflow (WF-02) => each logs `[leados mail:dev] to=… subject=… link=…` and the UI shows a devLink where applicable
2. Open each logged link => the target page works (invite accept, reset, verify)
3. Confirm no mail lines contain lead personal data beyond the recipient address

#### NOTF-03 — Real email delivery to a controlled mailbox (staging)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | owner@growthos-demo.example.com (owner, seed) (billing member = Catalyst-owned mailbox) |
| Preconditions and test data | RESEND_API_KEY for a verified test domain; EMAIL_FROM set; check 7. |
| Start route / navigation | /app/settings/ai-credits |
| Final expected state | Correct recipients; duplicates suppressed; failure degrades. |
| Observable evidence | Mailbox screenshots. |
| Negative / alternate path | — |
| Cleanup | Reset the level. |
| External access / cost / publication | Resend |
| Requirement IDs · route/action · resulting state | C-UX-01 · /app/settings/ai-credits · lowBalanceNotice, sendMail · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Set low-balance level above balance with email on; run one tool => exactly ONE email arrives at the billing member's mailbox; none to staff
2. Second run => none; 24 h later after recovery and drop => one more
3. Invite a member => invite email arrives; link accepts
4. Weekly Monday LeadOS digest (owners) => arrives Monday (record date)
5. Send failure (revoke the key) => the app degrades to logging with a devLink, no crash


### O. Settings

#### SET-01 — Organization settings and role gating

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed), analyst-a@growthos-test.example.com (analyst, invited in AUTH-05) |
| Preconditions and test data | Brightside. |
| Start route / navigation | /app/settings |
| Final expected state | org.manage enforced. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Restore the name. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/settings · updateOrg · LosOrg |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Owner: change Organization name, Website, Industry → **Save changes** => saved; audit org.update; header/workspace name updates
2. Analyst => fields disabled with 'Only owners and admins can edit organization details.'; devtools submit => 'Forbidden.'

#### SET-02 — Integrations: Slack webhook, outbound webhooks with HMAC

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser + API · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | A request-catcher URL over https (e.g. your own test endpoint) — or observe logs. |
| Start route / navigation | /app/settings/integrations |
| Final expected state | Signed outbound webhooks. |
| Observable evidence | Catcher payload + computed HMAC. |
| Negative / alternate path | — |
| Cleanup | Delete the webhook. |
| External access / cost / publication | A test endpoint |
| Requirement IDs · route/action · resulting state | n/a · /app/settings/integrations · saveSlack, addWebhook, toggleWebhook, deleteWebhook · LosWebhook |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Slack: URL 'https://example.com/hook' => refused (host must be hooks.slack.com); 'https://hooks.slack.com/services/T000/B000/xxx' => saved
2. **Add webhook** Endpoint 'http://…' => refused (https); 'https://<catcher>' with events lead.created => secret 'whsec_…' shown once; create a lead => the catcher receives a POST with header X-LeadOS-Signature sha256=HMAC(body, secret) — verify the HMAC
3. Pause the webhook => no delivery; resume; delete (confirm) => gone
4. Platform channel rows (Twilio, Resend, Meta lead ads, Google lead forms, Turnstile) => show configured/not configured truthfully

#### SET-03 — Kill switch effects and audit

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed), lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | A scheduled publication, an active workflow, a lead with consent. |
| Start route / navigation | /app/settings/workspace → Kill switch |
| Final expected state | Kill switch blocks tier ≥2 external actions and outreach. |
| Observable evidence | Screenshots; audit log. |
| Negative / alternate path | — |
| Cleanup | Off. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/settings/workspace, /admin/os · setKillSwitch, gateAction · CosWorkspace.killSwitch |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. **Stop all outbound** (confirm 'Block all publishing, sends and launches for this workspace?') => banner in the shell for every member; message lists N scheduled items for manual review (not cancelled)
2. Tick => scheduled publication blocked; workflow events not dispatched; one-to-one send blocked 'kill_switch'; tier-3 launch transitions refused 'Kill switch is on'
3. Editing, approvals, AI Studio quotes/runs still work (record: the kill switch does NOT stop AI use — owner decision if it should)
4. /admin/os header counts 'kill switches on'; Exceptions table shows it in red
5. **Turn off** => audit killswitch.off; blocked items need re-scheduling by a person

> Tester note: Admin only observes; the client controls it.

#### SET-04 — Provider connections UI: connect start/callback state pinning

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Integration · Staging |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Staging with LINKEDIN_CLIENT_ID/SECRET (or any one provider). |
| Start route / navigation | /app/settings/workspace → Connections |
| Final expected state | Connections verified only after a live access test. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Disconnect. |
| External access / cost / publication | Provider apps + redirect URIs |
| Requirement IDs · route/action · resulting state | C-CNT-01 · /api/os/connect/[provider]/start/callback · authorizeUrl, completeConnection · CosConnection verified/failed/disconnected |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. **Connect** LinkedIn => provider consent; on return `?connect=ok`; accounts discovered (member + org pages) with capabilities from GRANTED scopes
2. Tamper: start the flow, then edit the `state` query on the callback URL => `?connect=failed`, no connection stored
3. Start the flow in workspace A, switch the los_org cookie to workspace B before the callback => refused (cookie org must agree with membership/state)
4. **Test** => liveVerifiedAt stamped; **Disconnect** (confirm) => tokens destroyed; row kept with status disconnected

#### SET-05 — Team: roles list, staff not editable by clients, owner cannot be removed

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside with staff members. |
| Start route / navigation | /app/settings/team |
| Final expected state | Staff memberships only via /admin/os. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/settings/team · changeMemberRole, removeMember · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Members list => lead@/specialist@ shown with staff roles and no role select/Remove (client cannot alter staff)
2. Owner row => badge, no Remove; admin member tries to promote someone to owner => silently refused (only owner can)
3. Invite role options => admin, campaign_manager, sales_manager, sales_rep, analyst only

#### SET-06 — Timezone, currency and AI limits settings

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside. |
| Start route / navigation | /app/settings/workspace → AccountsPanel |
| Final expected state | Settings validated server-side. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Restore Asia/Kolkata, INR. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /app/settings/workspace, /app/settings/ai-credits · workspaceTime, creditsMemberLimit · CosWorkspace timezone/currency |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Timezone 'Asia/Kolkata' → 'Europe/London' + Currency 'GBP' => saved with the note about scheduled instants; Currency 'pounds' => refused (3 letters)
2. /app/settings/ai-credits → Member limits: set a limit for a member; **Save** => shown to that member
3. Analyst attempts workspaceTime via devtools => 'Forbidden.' (os.settings)

#### SET-07 — Full export (portability) in active and read-only workspaces

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser + API · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed), analyst-a@growthos-test.example.com (analyst, invited in AUTH-05) |
| Preconditions and test data | Brightside. |
| Start route / navigation | /app/engagement → Export everything |
| Final expected state | Everything visible is exportable. |
| Observable evidence | File size and top-level keys. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /api/os/export · buildExport · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. **Export everything** => JSON download: engagements, contracts, goals, work items with events, campaigns, variants with revisions, publications with attempts, metrics, opportunities, assets manifest (sha256), aiStudio.operations (with sources/provenance), credit ledger/orders/runs, notifications
2. Analyst (work.view) => export allowed; internal-only assets and internal comments absent
3. After handover (SET-11) => export still works

> Tester note: No CSV view for the credit ledger (known limitation).

#### SET-08 — Access revocation of a staff member and a client member during a session

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs), owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Specialist signed in in browser B on /app/work. |
| Start route / navigation | /admin/os/<brightside id> → People |
| Final expected state | Membership row is the only source of access. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Restore memberships. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /admin/os/[orgId] · removeStaff, addStaff · LosMembership |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Operator **Remove** specialist@ from Brightside => browser B's next request → workspace switcher no longer lists Brightside; direct URLs → 404/denied; if it was the only membership → /app/onboarding
2. Operator **Add staff** specialist@ role cgo_specialist again => access restored (existing account, no invite needed)
3. Owner removes a client member (AUTH-13) => same effect

#### SET-09 — Data retention / privacy deletion (LeadOS) is irreversible and global

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | ENTRY-09 verified access request; a synthetic B2C lead 'priya-1'. |
| Start route / navigation | /admin/leados/privacy-requests |
| Final expected state | DSR handling per runbook. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None possible. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /admin/leados/privacy-requests · completeAccessRequest, completeDeletionRequest, resolvePrivacyRequest · LosPrivacyRequest completed |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Access request: **Generate access package** => package lists every matching lead across tenants + consent history (view only; sending is manual)
2. Create a deletion request for priya-1 (ENTRY-09 with kind Delete) and verify; **Erase data & complete** => leads hard-deleted, global suppression added, consent ledger deletion event; request details nulled
3. Try to re-import priya-1 (LEAD-02) => rejected (suppressed)
4. Rejection path: **Mark completed** with outcome rejected and no note => refused; with note => rejected

> Tester note: IRREVERSIBLE — synthetic data only.


### O. Offboarding

#### SET-10 — PAUSE policy: what stops and what continues (owner decision)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser + background job · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed), owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside active with: a scheduled publication (+5 min), a recurring engagement, credits, an active workflow. |
| Start route / navigation | /app/engagement/<id> → Hold |
| Final expected state | AS BUILT: pause = skip recurring generation only. OWNER DECISION REQUIRED: should pause also hold scheduled posts / AI use / recurring fees? |
| Observable evidence | Screenshots of each continuing action while paused. |
| Negative / alternate path | — |
| Cleanup | Hold none. |
| External access / cost / publication | Scheduler |
| Requirement IDs · route/action · resulting state | C-REL-06 · /app/engagement/[id] · setHold, generateCycle · CosEngagement.hold paused |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Lead sets Hold 'Paused' with reason => hold event; owner cannot set holds
2. Wait for the tick => the scheduled publication STILL publishes (pause does not hold approved scheduled posts)
3. Owner runs an AI tool => works and debits (pause does not stop AI use)
4. Specialist edits a variant; owner approves something => both work
5. Recurring cycle for a new period => 'skipped' with no work items and no recurring fee (ENG-08)
6. Renewal reminder, metric sync, workflows => continue
7. Export => works; Results => unchanged
8. Resume (Hold None) => nothing back-filled

> Tester note: Decision 49 / C-REL-06. Do not change behaviour; document.

#### SET-11 — Handover: read-only workspace, history and export intact, credits/tools gone

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed), owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Workspace C with ONE engagement in stage completed, credits > 0, a scheduled publication (to test the block), an active workflow. |
| Start route / navigation | /app/engagement/<C id> → Handover and export |
| Final expected state | read_only: nothing writable; nothing deleted. |
| Observable evidence | Screenshots of refusals; export file. |
| Negative / alternate path | — |
| Cleanup | Re-provision if needed. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/engagement/[id] · handover (handOver), assertWritable · CosWorkspace accessMode read_only; CosContract ended |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Click **Complete handover** with a publication still scheduled => refused 'cancel or publish them first'; cancel it
2. **Complete handover** (confirm 'nothing is deleted') => contracts ended; stage offboarded; workspace read-only banner 'This workspace has been handed over and is read-only… export everything'
3. Owner: /app/studio => tools unavailable (aiTools emptied regardless of balance); /app/settings/ai-credits => balance still shown (record the number: unused credits are NOT refunded or expired automatically — OWNER DECISION)
4. Owner tries: new master, edit variant, approve, schedule, upload asset, buy credits, save profile => each refused 'This workspace is in handover (read-only). History and exports remain available.'
5. Work list, content, approvals log, results, assets download, /api/os/export => all readable
6. Workflows => runs? Record whether the active workflow still fires on a new lead (assertWritable is not checked by the engine) — OWNER DECISION
7. Operator /admin/os/<org> New engagement => workspace flips back to active (returning client)

> Tester note: HANDOVER_STEPS (manual): export delivered, source files confirmed, Catalyst access removed, connections disconnected, workflows kept/paused, final invoice — these are people steps, not software.

#### SET-12 — Handover with another engagement still open keeps the workspace active

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | lead@growthos-demo.example.com (cgo_lead, seed) |
| Preconditions and test data | Brightside with two engagements (ENG-10), engagement 2 completed. |
| Start route / navigation | /app/engagement/<eng 2> |
| Final expected state | Per-engagement handover. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /app/engagement/[id] · handOver · accessMode active |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. **Complete handover** on engagement 2 => its contracts end; workspace stays active (engagement 1 open); modules from engagement 2's contract disappear if not covered by engagement 1
2. History on engagement 2 remains readable

#### SET-13 — Contract end / termination by operator; expiry not modelled

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | Any active contract. |
| Start route / navigation | /admin/os/<org> → Contracts |
| Final expected state | Termination removes entitlements; recurring cycles stop generating when the engagement is not active. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Re-propose/sign. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /admin/os/[orgId] · endContract · CosContract ended |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. **End** (super_admin only; support_admin sees no button / refused) with reason => ended; client nav loses the modules; AI tools from it gone; credits remain; scheduled publications? Record: they are NOT cancelled by ending a contract (gap G-OFF-1 — publish-time preflight will fail on 'module out of scope')
2. There is no contract expiry/end date enforcement => note 'Owner decision required: automatic expiry'


### Operator

#### OPS-01 — Operator command centre: exceptions, scheduler banner, org list

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | Admin session; scheduler running. |
| Start route / navigation | /admin/os |
| Final expected state | Exception-only view is accurate. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-REL-04 · /admin/os · schedulerHealth · CosHeartbeat |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Header counts; Scheduler banner 'last ran N min ago' (neutral); stop the tick loop for 16 min => banner turns red 'scheduled posts, waits and recurring work are NOT running'; restart => neutral
2. Exceptions table => rows for approvals >3 days, blocked, overdue, failed, kill switch (create each condition and confirm)
3. 'Publishing and connection issues' => the uncertain/failed publications from PUB-04/06 and failed connections; dead/stuck jobs section (force one dead job: WF-02 HTTP 500 step is a run failure not a job — instead set a LosJob to dead in DB) => listed with lastError
4. All organizations => includes 'CRM only' legacy orgs

#### OPS-02 — Provision workspace C with an owner invite; demo flag

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) then owner-c@growthos-test.example.com (owner of workspace C, provisioned in OPS-02) |
| Preconditions and test data | Admin session; dev console visible. |
| Start route / navigation | /admin/os → New workspace |
| Final expected state | Workspace C ready for SCOPE-01. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Wiped by SETUP-05 (demo). |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-JRN-01 · /admin/os · provisionWorkspace · LosOrg; CosWorkspace prospect; CosEngagement prospect |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Name 'Testcase Clinic (demo)', Website 'https://testcase.example', Market India, Industry Healthcare, Client owner email 'owner-c@growthos-test.example.com', Engagement name 'Pilot 2026', goals visibility+acquisition, Readiness assets_ready, tick 'Demo workspace (wipeable)' => created; invite link printed (devLink) and audit os.workspace_provisioned
2. Open the invite link signed out => 'Join Testcase Clinic (demo)' role owner → set name/password → **Accept invitation** => dashboard; workspace kind prospect; no modules beyond core
3. Owner email already used by an existing user (owner@) => provisioning invites the existing account (no new user)
4. Source audit lead select => only unclaimed delivered audits; pick one (if ENTRY-04 approved) => findings imported to /app/audit

#### OPS-03 — Per-org console: staff, contracts, audits, work by state

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | Workspace C. |
| Start route / navigation | /admin/os/<orgC id> |
| Final expected state | Staff managed only here. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /admin/os/[orgId] · addStaff, removeStaff · LosMembership staff |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. **Add staff** 'lead@growthos-demo.example.com' role cgo_lead => membership added immediately (existing user); role 'owner' => refused (staff roles only)
2. **Add staff** a new email => invite link logged
3. **Remove** => gone; Work by state table matches /app/work

#### OPS-04 — Operator role separation (platform roles)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser + technical · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | The env-admin cookie maps to super_admin. To test other platform roles set LosUser.platformRole for a test user (DB) and sign in via /app/login then open /admin/os. |
| Start route / navigation | /admin/os |
| Final expected state | requirePlatform enforces role names per action. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Clear platformRole. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /admin/** · requirePlatform · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. support_admin => /admin/os/credits allowed; **End** contract refused; /admin/leados/tokens grant refused (super_admin only)
2. compliance_admin => privacy requests and reviews allowed; plans refused
3. auditor => read-only pages; any action → 'Forbidden.'/401
4. Partner session cookie hitting /admin/os => 401 (not a platform role)

> Tester note: Admin actions THROW on refusal (401/403 page), unlike client actions — observation.

#### OPS-05 — Grant credits to Brightside (used by other tests)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | Admin. |
| Start route / navigation | /admin/os/credits → Grant or adjust |
| Final expected state | Balance +100. |
| Observable evidence | Wallet row. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-UX-03 · /admin/os/credits · walletGrant · CosCreditGrant promotional |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Workspace id (copy from /admin/os/<org> URL), Type Promotional, Credits 100, 'does not expire', Reason 'manual test grant' => 'Credits added'

#### OPS-06 — Rate card lifecycle: draft, activate, retire previous, quotes keep version

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | Synthetic card active (seed). |
| Start route / navigation | /admin/os/credits → Rate cards |
| Final expected state | Versioned, immutable cards. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Activate a full synthetic card again. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-CR-02 · /admin/os/credits · rateCardCreate, rateCardActivate · CosCreditRateCard active/retired |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. **New rate card** with invalid JSON => refused; with a tool priced base 0 perK 0 => refused (not both zero); with 'Synthetic test values' ticked and valid rates => draft version n+1
2. **Activate** => previous card retired; 'Tools priced: k / 17'; remove a tool key and activate another card => that tool shows 'Credit pricing … not configured' for clients (unpriced = unavailable) while staff internal still works
3. Cards are never edited (no edit control)

#### OPS-07 — Audit report review queue (marketing audits)

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local + configuration |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | ENTRY-04 submitted lead; model key for generation. |
| Start route / navigation | /admin/reviews/<leadId> |
| Final expected state | Human approval gate. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Model key; Resend |
| Requirement IDs · route/action · resulting state | n/a · /admin/reviews/[id] · approve, reject, regenerate · Report approved |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. **Save edits** JSON, **Approve & deliver** without 'Your name' => refused; with name => approved; report public link works; email logged/sent
2. **Reject & regenerate** without reason => refused
3. Observation: these actions rely only on the /admin middleware cookie (no in-action auth call) — record O-ADMIN-1

#### OPS-08 — Lead-supply admin: dataset upload, compliance review, inventory

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | Synthetic CSV of 30 B2C rows (name,email,phone,city) and 20 B2B rows. |
| Start route / navigation | /admin/leados/datasets |
| Final expected state | Inventory exists for LEAD-06/07. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Demo-flagged → wipe. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /admin/leados/datasets, /admin/leados/reviews, /admin/leados/inventory · uploadDataset, saveDatasetMapping, approveDataset, decideReview · LosDataset approved; LosInventoryRecord available |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Upload B2C dataset with purposes+channels+evidence, Exclusivity shared, Max clients 2, Cooling 7, Expiry 90, 'demo data' ticked => status compliance_review + a pending review
2. Missing evidence for B2C => refused
3. Map columns (email or phone required) → **Save**; /admin/leados/reviews → **Approve** => materialised; /admin/leados/inventory shows records available
4. Reject another dataset with a note => rejected

#### OPS-09 — Custom plans (sales) and booking link

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | Admin. |
| Start route / navigation | /admin/plans/new |
| Final expected state | Token pages noindex. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | Delete the plan. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /admin/plans, /plans/[token] · savePlan, setPlanStatus, deletePlan · CustomPlan |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Customer name, email, Market, tiers (one with a price, one blank = book a call), **Save** => listed; CopyLink /plans/<token>
2. Open /plans/<token> signed out => tiers; blank-price tier shows 'book a call'; expired (set Valid until past) => 404
3. Status select sent/accepted/expired; delete

#### OPS-10 — Admin leads sales status

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | ENTRY-03 lead. |
| Start route / navigation | /admin/leads |
| Final expected state | n/a |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /admin/leads · setSalesStatus · Lead.salesStatus |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Set Sales status 'Hot' → **Save** => saved; event logged


### Background jobs

#### JOB-01 — Tick authentication and lease

| Field | Value |
|---|---|
| Priority / type / environment | P0 · API · Local (dev-verify, http://localhost:3100) |
| Account and role | Tester |
| Preconditions and test data | Dev server. |
| Start route / navigation | PowerShell |
| Final expected state | Bearer-only; overlap-safe. |
| Observable evidence | curl outputs. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-SAFE-04, C-REL-04 · /api/os/tick · runTick, takeLease · CosHeartbeat os.tick.lease |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. `curl -i http://localhost:3100/api/os/tick` => 401
2. `curl -i -H "Authorization: Bearer wrong" …` => 401
3. `curl -i -H "Authorization: Bearer local-dev-cron-secret" …` => 200 JSON {published, cycles, jobsRan…}
4. Fire 3 concurrent authorised calls (`Start-Job` ×3) => at most one runs the sweeps (others `skipped:true`); lease releases (next call runs)
5. Harness: `npx vitest run tests/os/completion-entry.test.ts -t "tick"`

> Tester note: Staging: GET without bearer must be 401; production: same check is safe.

#### JOB-02 — Job queue: retries with backoff, dead-letter, stuck detection

| Field | Value |
|---|---|
| Priority / type / environment | P1 · API/action (harness) + browser · Local (dev-verify, http://localhost:3100) |
| Account and role | Tester + Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | Test DB. |
| Start route / navigation | PowerShell |
| Final expected state | Operators see failures. |
| Observable evidence | Vitest; screenshot. |
| Negative / alternate path | — |
| Cleanup | Delete the fake rows. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-REL-04 · /admin/os · schedulerHealth · LosJob dead/running |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. `npx vitest run tests/leados/jobs.test.ts` => passes (once, idempotent by key, backoff, dead at maxAttempts)
2. Browser: set a LosJob row to status running with lockedAt = now-40 min => /admin/os shows 'stuck for over 30 minutes'; set status dead => 'gave up after all retries' with lastError

#### JOB-03 — Approval expiry sweep (14 days)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Background job · Local (dev-verify, http://localhost:3100) |
| Account and role | Tester + owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | A requested approval; scheduler running. |
| Start route / navigation | DB + /app/approvals |
| Final expected state | Expired approvals cannot be decided. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Scheduler |
| Requirement IDs · route/action · resulting state | n/a · /app/approvals · runTick approval expiry · CosApproval expired |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Set the approval's expiresAt to 1 minute ago; wait a tick => status expired; owner's Approvals no longer lists it; attempting to decide (stale tab) => 'expired'
2. Staff re-request => a new approval

#### JOB-04 — Scheduler trigger on staging/production (GitHub or Vercel cron)

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Integration · Staging |
| Account and role | Local operator (email/password pair defined as ADMIN_ACCOUNTS in scripts/dev-verify.mjs) |
| Preconditions and test data | Exactly one trigger configured with GROWTHOS_TICK_URL + CRON_SECRET (check 6). |
| Start route / navigation | /admin/os |
| Final expected state | Nothing is scheduled until this passes. |
| Observable evidence | Screenshots over time. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | Repo secrets / Vercel plan |
| Requirement IDs · route/action · resulting state | C-REL-04, C-STG-01 · /api/os/tick · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Let it run for an hour => 'last ran' stays under 5–10 minutes; no dead/stuck jobs
2. `curl -i https://<staging>/api/os/tick` => 401
3. Production (read-only): open /admin/os and confirm the banner is neutral; do NOT trigger anything

> Tester note: vercel.json only has two daily LeadOS crons today.

#### JOB-05 — LeadOS daily cron safety net and nurture cron auth

| Field | Value |
|---|---|
| Priority / type / environment | P2 · API · Local (dev-verify, http://localhost:3100) |
| Account and role | Tester |
| Preconditions and test data | Dev server. |
| Start route / navigation | PowerShell |
| Final expected state | Both crons bearer-protected. |
| Observable evidence | curl outputs. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-SAFE-04 · /api/leados/cron, /api/cron/nurture · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. `curl -i http://localhost:3100/api/leados/cron` => 401; with the bearer => 200 (enqueues allocations, sequence ticks, alerts, workflow schedules; drains jobs)
2. `curl -i http://localhost:3100/api/cron/nurture` => 401; with bearer => 200 and no email locally

#### JOB-06 — Dev stand-in endpoints are absent in production

| Field | Value |
|---|---|
| Priority / type / environment | P0 · API · Production (read-only checks only) |
| Account and role | Tester |
| Preconditions and test data | Production or staging URL. |
| Start route / navigation | PowerShell |
| Final expected state | No dev shortcut reachable. |
| Observable evidence | curl; settings screenshot with values hidden. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-SAFE-03 · /api/dev/llm/chat/completions · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. `curl -i -X POST https://<host>/api/dev/llm/chat/completions` => 404
2. Staging: confirm GROWTHOS_TEST_ADAPTER, GROWTHOS_DEV_LLM, ASSET_STORAGE_ALLOW_LOCAL, TEST_DATABASE_URL are unset in the host settings (names only)
3. Harness: `npx vitest run tests/os/completion-entry.test.ts -t "dev"` and `tests/os/release-gaps.test.ts -t "production"`


### Cross-cutting

#### XQ-01 — Mobile layout (375 px) on key client screens

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Browser devtools device mode 375×812. |
| Start route / navigation | /app/dashboard |
| Final expected state | Record any page with horizontal overflow as a defect. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-VER-02 · multiple · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Visit Home, AI Studio, a tool page, a run result, AI credits, Content calendar, a content piece, Engagement, Approvals, Results, Leads, Settings → Team => no horizontal page scroll; controls reachable; tables scroll inside their container
2. Operator pages /admin/os, /admin/os/credits at 375 px => no page-level horizontal scroll (two overflow defects were fixed 2026-09-21; re-check)

#### XQ-02 — Keyboard navigation, skip link, visible focus

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Manual accessibility · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | None. |
| Start route / navigation | /app/content |
| Final expected state | No keyboard traps. |
| Observable evidence | Notes per page. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-A11Y-01 · multiple · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Press Tab once => 'Skip to content' link visible; Enter => focus moves to main
2. Tab through the Studio form and the variant editor => every control reachable in a logical order with a visible focus ring; selects and checkboxes operable; forms submit with Enter
3. Approvals: reach **Approve**/**Reject** by keyboard; the Reject reason textarea receives focus
4. Confirm dialogs (`confirm()`) are keyboard-dismissable

> Tester note: This is a functional keyboard pass, not an accessibility certification.

#### XQ-03 — Form labels, error messages, screen-reader journey

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Manual accessibility · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | NVDA (Windows) or VoiceOver; browser accessibility tree. |
| Start route / navigation | /app/studio/linkedin_post |
| Final expected state | Record every unlabelled control. |
| Observable evidence | Notes. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-A11Y-01 · multiple · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Every input announces a label (no 'edit text' without a name); required fields announced; the quote/run status region is aria-live (announced when the run completes)
2. Submit an invalid form => the error is announced (role=alert) and associated with the field
3. Login, invite acceptance, approval decision, credits page => complete each with the screen reader only
4. One h1 per page; landmarks main/nav present

> Tester note: NO screen-reader pass has been performed to date (release report §5). This is the first.

#### XQ-04 — Colour contrast

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Manual accessibility · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | A contrast checker (browser devtools). |
| Start route / navigation | /app/dashboard |
| Final expected state | List of elements below the proposed threshold. |
| Observable evidence | Table of ratios. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-A11Y-01 · multiple · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Measure body text, muted captions ('n/a means…'), badge text (status pills), button text, links on light background => record ratios; propose ≥4.5:1 for text and ≥3:1 for large text/UI as the UNAPPROVED threshold

> Tester note: Contrast has never been measured. Threshold not approved by the owner.

#### XQ-05 — Loading, empty, error and success states

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner-c@growthos-test.example.com (owner of workspace C, provisioned in OPS-02) |
| Preconditions and test data | Workspace C (empty) and Brightside (populated). |
| Start route / navigation | /app/dashboard |
| Final expected state | No blank panels. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · multiple · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Workspace C: Home, Work, Content, Results, Assets, Engagement, Studio history, Leads => every page shows its documented empty state text (see route inventory) and a next action link
2. Studio run page while queued => 'Waiting to start…' then 'Working on it…' then result (auto-refresh)
3. Success messages after saves are visible and not stale after navigation

#### XQ-06 — Slow connection and interrupted actions

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Devtools network throttling 'Slow 3G'. |
| Start route / navigation | /app/studio/linkedin_post |
| Final expected state | No half-applied writes. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-CR-09 · multiple · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Get quote → Run, then close the tab during 'Working on it…' => reopen /app/studio → run appears in history and completes (server-side job); one debit
2. Upload a 30 MB asset on Slow 3G and cancel mid-way => no orphan asset row (list after reload)
3. Submit the variant edit form and immediately navigate away => the save either completed fully (new version) or not at all

#### XQ-07 — Refresh, browser back and multiple tabs

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | None. |
| Start route / navigation | /app/approvals |
| Final expected state | Stale views fail safely. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · multiple · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Approve in tab A; in tab B (stale) click **Approve** on the same item => message that it is already decided/changed, no second approval row
2. Press Back after a form POST and Forward => no resubmission side effects (grants, runs, campaigns are idempotent — verify counts)
3. Refresh the Studio run page repeatedly => no duplicate charges

#### XQ-08 — Long text, Unicode, special characters, large files

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | None. |
| Start route / navigation | /app/content |
| Final expected state | No injection or truncation surprises. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · multiple · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Campaign name with emoji and RTL text 'Ω 😀 مرحبا' => saved and rendered; export JSON preserves it
2. Variant body with 3,000 characters of Unicode on linkedin:post => at the limit accepted; 3,001 → problem
3. Lead first name with `=HYPERLINK(...)` => export CSV escapes it
4. Topic input with `<script>alert(1)</script>` in Studio => rendered as text, not executed; the [TEST DRAFT] title shows it escaped
5. Asset name with 200+ characters => capped; a 500 MB MP4 upload => accepted (≤512 MB) — optional, time-consuming

#### XQ-09 — Date, timezone, currency and number formatting

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Brightside (INR, Asia/Kolkata), Northwind (EUR, Europe/Berlin). |
| Start route / navigation | /app/results |
| Final expected state | Consistent formatting. |
| Observable evidence | Screenshots. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · multiple · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Money tiles show the currency code/symbol per tile; minor units rendered with two decimals; no float artefacts (e.g. 85,000.00 not 84,999.99)
2. Calendar and quotes show times in the workspace zone with the zone named; the quote 'Valid until' matches local time
3. Period labels carry the zone; 'This week' starts Monday

#### XQ-10 — Unexpected error boundary

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser + technical · Local (dev-verify, http://localhost:3100) |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Dev server. |
| Start route / navigation | /app/work |
| Final expected state | error.tsx only for unexpected failures. |
| Observable evidence | Screenshot. |
| Negative / alternate path | — |
| Cleanup | Postgres running. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-REL-03 · /app/(shell)/error.tsx · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Stop Postgres (`pg_ctl stop`) and load /app/work => the shell error page 'Something went wrong on our side' with a digest and **Try again** / **Go to Home**; no stack trace or connection string visible
2. Restart Postgres; **Try again** => page recovers

> Tester note: Never force-triggered before this pass.

#### XQ-11 — Accidental exposure sweep

| Field | Value |
|---|---|
| Priority / type / environment | P0 · Browser + API · Local (dev-verify, http://localhost:3100) |
| Account and role | analyst-a@growthos-test.example.com (analyst, invited in AUTH-05) and owner-c@growthos-test.example.com (owner of workspace C, provisioned in OPS-02) |
| Preconditions and test data | Ids from Brightside noted. |
| Start route / navigation | Signed in as owner-c (workspace C) |
| Final expected state | Zero cross-tenant reads. |
| Observable evidence | List of URLs with responses. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-REL-01 · multiple · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Open each Brightside id on: /app/content/<id>, /app/content/campaigns/<id>, /app/studio/history/<id>, /app/leads/<id>, /app/workflows/<id>, /app/leads/import/<id>, /api/os/assets/<id>, /app/campaigns/<id> => 404 or denied for every one
2. /api/os/export => only workspace C
3. Search fields (Leads search, Discover) => never return other tenants' rows
4. Public /app/c/<publicId> => shows only the campaign's own org name

#### XQ-12 — Recovery after provider or worker failure (end to end)

| Field | Value |
|---|---|
| Priority / type / environment | P1 · Browser + background job · Local (dev-verify, http://localhost:3100) |
| Account and role | specialist@growthos-demo.example.com (cgo_specialist, seed) |
| Preconditions and test data | Scheduler running. |
| Start route / navigation | /app/content/<master id> |
| Final expected state | Every boundary recovers without double effects. |
| Observable evidence | Screenshots; vitest. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | C-CR-09, C-CR-11 · multiple · reconcileStudio, runDuePublications · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Kill the dev server while a publication is 'claimed' (set claimedAt old) => next tick parks it uncertain; a person reconciles (PUB-04)
2. Kill the server while a Studio run is queued (before running) => after 2 minutes the sweep re-enqueues it once; it completes; one debit
3. Kill the server after the draft was stored but before settlement (harness: completion-credits 'recovered') => charged once on the next sweep

#### XQ-13 — Performance thresholds (UNAPPROVED proposal)

| Field | Value |
|---|---|
| Priority / type / environment | P2 · Browser · Staging |
| Account and role | owner@growthos-demo.example.com (owner, seed) |
| Preconditions and test data | Staging; browser devtools Performance/Network. |
| Start route / navigation | /app/dashboard |
| Final expected state | Numbers recorded against the proposal. |
| Observable evidence | Table. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · multiple · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. Measure time-to-interactive for Home, Content calendar, Results (30-day), AI credits => record; PROPOSED thresholds (not approved): ≤3 s on a normal connection, ≤8 s on Slow 3G; tick route ≤40 s; upload of 15 MB ≤60 s

> Tester note: No approved performance requirements exist.

#### XQ-14 — Security headers and robots for app/admin

| Field | Value |
|---|---|
| Priority / type / environment | P2 · API · Staging |
| Account and role | Tester |
| Preconditions and test data | Staging. |
| Start route / navigation | PowerShell |
| Final expected state | n/a |
| Observable evidence | Headers. |
| Negative / alternate path | — |
| Cleanup | None. |
| External access / cost / publication | None |
| Requirement IDs · route/action · resulting state | n/a · /robots.txt · n/a · n/a |
| Result · Evidence · Defect | Not run · — · — |

Actions (each line: do → expect):

1. `curl -I https://<host>/app/login` => cookies not set; `/admin/os` → 302 to /admin/login; robots.txt disallows /admin and /plans; app pages carry noindex

> Tester note: This pack is NOT a penetration test.
