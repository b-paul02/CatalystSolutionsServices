# GrowthOS — testing gaps, blockers and unresolved rules

Compiled 2026-09-22 from the code on branch `growthos-v2` (inspection of routes, actions, models, jobs, tests) and the release documents dated 2026-09-21. **Code is the source for "as built"; the brief and the decision files are the source for "intended".** Where they differ, both are stated.

Status words: **Missing (in scope)** = the agreed scope expects it and it is not built · **Partially implemented** = built but a documented branch is absent · **Requires configuration** = built, needs keys/settings · **Requires external verification** = built, only ever met fixtures · **Optional / deferred** = explicitly out of the brief · **Owner decision required** = policy not settled.

## 1. Owner decisions required (policy, not code)

| # | Question | As built today | Where it shows | Tests that document it |
|---|---|---|---|---|
| D1 | **What should pausing an engagement stop?** | Pause (`hold = paused`) is staff-only and only skips recurring-cycle generation (the period is recorded as `skipped`, no work items, no recurring fee). It does **not** hold approved scheduled publications, AI Studio use, editing, approvals, renewal reminders, metric sync, workflows or exports. Resume back-fills nothing. The kill switch is the stop for publishing. | `lib/os/engagement.ts` `generateCycle`; decision 49; requirement C-REL-06 | SET-10, ENG-08 |
| D2 | Should the **kill switch** also block AI Studio runs? | It blocks tier ≥ 2 external actions, publishing, outreach sends and workflow dispatch. AI quotes/runs still work. | `lib/os/workflow.ts` `gateAction`; `lib/os/studio.ts` | SET-03 |
| D3 | **Unused credits after handover / termination** | Balance stays on the wallet; tools are removed by entitlement; nothing expires or refunds automatically. | `handOver`; `entitlements` | SET-11 |
| D4 | **Workflows after handover** | `assertWritable` is not consulted by the automation engine; an active workflow can still fire after the workspace turns read-only. Manual HANDOVER_STEPS say "workflows kept or paused". | `lib/os/automation/engine.ts` | SET-11 step 6 |
| D5 | Should a **won partner deal auto-create** the workspace? | Manual: operator picks the deal in "New workspace". | `provisionWorkspace` | PTR-07 |
| D6 | Offer **staff-assisted client-billed AI** at all? | The control exists (`CosAiBillingAuth`, client-granted, capped, revocable); default is never. | decision 12 | AIX-12 |
| D7 | **Prices, packs, tax, currencies, FX** (`AI_FX_INR_PER_USD`), margin floor `AI_MIN_MARGIN_PCT` | Only synthetic rows exist; the proposal in `GROWTHOS_AI_PRICING_PROPOSAL.md` pre-fills a draft; activation is refused until provider prices and a real pack exist. | `/admin/os/credits` | CRD-05, OPS-06 |
| D8 | **Included credits per signature vs per cycle** | Granted once per signed scope with an explicit number; per-cycle top-ups are operator grants. | decision 34 | SCOPE-05 |
| D9 | **Scheduler trigger** in production (GitHub workflow vs Vercel cron) | Nothing is scheduled in production today; `vercel.json` has only the two daily LeadOS crons. | `GROWTHOS_STAGING_SETUP.md` §4 | JOB-04 |
| D10 | **Web research** (buy a Brave plan; confirm terms allow AI use) | Off until `BRAVE_SEARCH_API_KEY` exists; honest "source-based drafting" label. | decision 33 | AIX-11 |
| D11 | **X developer tier** (paid) or keep X manual | Adapter built; scope string lacks `media.write` (see G-PUB-1). | `lib/os/connectors.ts` | PUB-10..12 |
| D12 | **Video generation vendor** or leave out | Not implemented; human path (script → file in Assets → variant → approval → publish) complete and labelled. | release report §6 | AI-11, AI-12, CONT-03 |
| D13 | **Retention policy** for assets and GrowthOS data | No deletion exists (assets only archive); DSR deletion covers LeadOS B2C leads. | `lib/os/assets.ts` | AST-05, SET-09 |
| D14 | **Contract expiry / proposal expiry** | Not modelled: proposals stay open until signed/declined/ended; contracts have no end-date enforcement. | `CosContract` | SCOPE-01, SET-13 |
| D15 | **Self-service registration** (`GROWTHOS_SELF_SERVICE`) | Off (decision 27). | `register` | AUTH-04, AUTH-07 |
| D16 | Secret rotation for keys exposed on 2026-09-18 | Status unknown (owner). | `GROWTHOS_DECISIONS.md` | — |
| D17 | Permission to make local commits and their grouping | None given. | release report §9 | — |
| D18 | Facebook video upload token (user vs Page) | Open question until the live check. | release report §4 | PUB-19 |
| D19 | Performance thresholds | None approved; XQ-13 proposes values labelled unapproved. | — | XQ-13 |
| D20 | Accessibility target (which conformance level, if any) | No screen-reader pass ever performed; contrast never measured. | release report §5 | XQ-02..04 |

## 2. Missing or partial against the agreed scope

| ID | Item | Finding (as built) | Category | Tests |
|---|---|---|---|---|
| G-PUB-1 | X media publishing scope | `adapters.ts` documents that `media.write` is required for chunked upload, but the requested OAuth scope string in `connectors.ts` is `tweet.read tweet.write users.read offline.access` — image/video posts on X will fail with a permission error until the scope is added (and the app tier allows it). | Partially implemented | PUB-11, PUB-12 |
| G-PTR-1 | Partner deal stage `lapsed` | Documented as "set by the system, never by hand"; no code path sets it. Protection expiry never frees an account for another partner (only the 30-day recent-activity rule applies). | Partially implemented | PTR-04 |
| G-CAL-1 | Reschedule a publication | `publicationReschedule` action exists; no UI calls it. Reschedule = Cancel + Schedule. | Partially implemented | CAL-02 |
| G-ENG-1 | Void a commercial record | `recordVoid` exists; no UI calls it. | Partially implemented | ENG-02 |
| G-OFF-1 | Ending a contract does not cancel scheduled publications | They fail at publish time on "module out of scope" instead of being cancelled up front. | Partially implemented | SET-13 |
| G-NOTF-1 | Email notifications for approvals/publishing/blocked work | In-app only (`lib/os/notify.ts`); the only email notice is the AI low-balance one. `connection_failed` notification kind is declared but never emitted. No opt-outs except low balance. If the business expects email/digests, this is missing. | Missing (owner to confirm expectation) | NOTF-01 |
| G-ENTRY-1 | Contact form persistence/attribution | `/contact` posts to Web3Forms only: no server validation (`noValidate`), no DB row, no dedupe, no UTM/referral capture on any marketing form. | Partially implemented | ENTRY-02 |
| G-AST-1 | Asset deletion / retention | No user deletion, no cleanup job; archive only. | Missing (policy) | AST-05 |
| G-SCOPE-1 | "Expired proposal" state | Not modelled (see D14). | Missing (policy) | SCOPE-01 |
| G-A11Y-1 | Screen-reader pass, contrast measurement | Never performed; XQ-03/XQ-04 are the first. No conformance claimed. | Verification gap | XQ-02..04 |
| G-VER-1 | Interactive browser walk of older forms; error boundary never force-triggered | Release report §5. | Verification gap | XQ-10 and the whole pack |
| G-SITEMAP | `/work`, `/resources` in `sitemap.ts` | Folders are `app/_work`, `app/_resources` (private) → 404. | Defect | ENTRY-01 |
| G-CSV-1 | Credit ledger CSV view | JSON export only. | Optional | SET-07 |
| O-ADMIN-1 | `app/(site)/admin/reviews/actions.ts` | No in-action authorization call; relies solely on the `/admin` middleware cookie, unlike every sibling. | Observation (security hygiene) | OPS-07 |
| O-AUTH-1 | Operator credentials | `ADMIN_ACCOUNTS` passwords compared in plain text with `===`; admin session token carries no expiry. | Observation | AUTH-14 |
| O-AUTH-2 | Rate limiters are in-memory per instance (marketing routes, partner apply, login) | Ineffective across multiple serverless instances. | Observation | ENTRY-03, AUTH-02 |
| O-SCOPE-1 | Signature has no typed name / e-sign artefact | Signature = owner permission + click. | Observation | SCOPE-02 |
| O-ONB-1 | Business profile has no required fields | Any subset saves. | Observation | ONB-01 |
| O-ACT-1 | Dead server actions | `newContentItem`, `variantDecide`, `publicationReschedule`, `recordVoid`, `recomputeScore` have no callers. | Observation | — |
| O-ACT-2 | Several actions call `requireOrg()` with no permission and rely on `lib/os/*` re-checks | Safe today; no action-level defence in depth. | Observation | — |

## 3. Explicitly optional / deferred (not defects)

- Instagram Stories; LinkedIn polls and articles (not in the brief).
- AI video generation (no vendor chosen).
- Page-level fetching for research (SSRF surface; decision 39).
- Rich-text editor.
- Lead-token refund automation (manual review by design).
- Doctor audit and Growth Audit pipelines beyond intake (marketing product; separate appendix).

## 4. Configuration blockers (build is ready; environment is not)

| Blocker | Unblocks | Check |
|---|---|---|
| Staging database + secrets (`LEADOS_SECRET`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`, `ADMIN_ACCOUNTS`) with schema applied per `GROWTHOS_STAGING_SETUP.md` §6 (reviewed SQL diff, index swap by hand, never `--accept-data-loss`) | every staging test | — |
| Capped text-model key (`LLM_*`, `LLM_PRICE_*`) | AI usefulness, timeout behaviour, real narratives | 1 |
| Image provider (`IMAGE_*`, `IMAGE_PRICE_MICROS`) | AI-16, AST-07 | 2 |
| Brave Search plan (`BRAVE_SEARCH_API_KEY`, `RESEARCH_PRICE_MICROS`, `research` rate line) | AIX-11 | 3 |
| Vercel Blob store (`ASSET_STORAGE=vercel_blob`, `BLOB_READ_WRITE_TOKEN`, `MEDIA_PUBLIC_ORIGIN`) | AST-04, Meta media | 4 |
| Stripe test keys + webhook with the 8 events; owner-accepted rate card + one real pack | CRD-06..08, CRD-10, ENTRY-05 | 5 |
| One scheduler trigger (`GROWTHOS_TICK_URL` + `CRON_SECRET` repo secrets, or Vercel cron) | JOB-04 and every scheduled behaviour on staging | 6 |
| Resend key for a test domain + a Catalyst-owned mailbox | NOTF-03, CRD-04 email | 7 |
| X tier + `media.write`; LinkedIn Community Management approval; Meta App Review; Google OAuth client with YouTube/GA4/GSC scopes; test accounts for each | PUB-09..24, PUB-26, SET-04, ANL-07 | 8–12 |
| Provider sandboxes for Google/Meta lead-ad webhooks and Twilio | ad-platform ingestion, STOP handling | — |

## 5. Discrepancies between documents and code found during discovery

| Document says | Code shows | Resolution |
|---|---|---|
| `docs/os/blueprint.md` "Deliverables are links; no file storage yet" and "Meta shown as Coming soon" | Assets with private storage exist; Meta is connectable when configured | Blueprint predates v2; `GROWTHOS_DECISIONS.md` #29 supersedes |
| `GROWTHOS_COMPLETION_HANDOFF.md` §4 "Facebook Page video: M (missing)" | Implemented in the release pass (fixture-tested) | Release report §4 is current |
| Release report "Low-balance notices in-app only" (§8 item 7 of handoff) | Email implemented in the release pass with opt-out | Release report §2 D is current |
| `GROWTHOS_EXTERNAL_SETUP.md` "X: media posts are not implemented" | X media upload implemented | Handoff/release report current; scope string still lacks `media.write` (G-PUB-1) |
| Reports page header "owners get this as a weekly email every Monday" | That is the LeadOS `losDailyMetric` digest (needs Resend), not a GrowthOS report | Verify on staging (NOTF-03) |
| Partner docs: stage `lapsed` set by the system | No code sets it | G-PTR-1 |
| Sitemap lists `/work` and `/resources` | Not routable | G-SITEMAP |

## 6. Coverage limitations of this pack

- **Documented ≠ executed.** Every row in the tracker starts at Not run. Nothing in this pack has been executed by its author; the historical automated results (typecheck exit 0; vitest 51 files / 578 tests; production build exit 0 on 2026-09-21, logs in `growthos-release-evidence/`) are evidence about the build, not manual passes.
- 39 of 229 cases cannot run without configuration or external accounts; 21 are integration cases on staging with real providers.
- Ad-platform webhooks (Google/Meta lead ads), Twilio inbound, and the Doctor audit pipeline have no scripted manual case (provider sandbox required); they are listed in the matrix as requiring external verification.
- Cross-cutting accessibility cases are a functional keyboard/screen-reader/contrast pass, not a certification; XQ-14 is not a penetration test.
- AI usefulness can only be judged with a real model; the stand-in returns fixed `[TEST DRAFT]` text, so local AI cases prove mechanics (quote, hold, charge, validators, save destination), not quality.
- Concurrency and webhook-replay behaviour are proven through the harness suites named in the tests (`completion-credits`, `completion-signing`, `completion-entry`, `release-gaps`), which drive the real server actions and routes; browser double-click checks are included but are weaker.
- The route/button inventory was built by reading every `page.tsx`, `layout.tsx`, `route.ts` and `actions.ts` under `app/`; the feature list by reading `lib/os/*`, `lib/leados/*`, `lib/partner/*`, `prisma/schema.prisma`, the automation catalog and `tests/**`. Unmapped items found: the dead actions in O-ACT-1 (no UI to test), the `connection_failed` notification kind (never emitted), and the two sitemap entries.
