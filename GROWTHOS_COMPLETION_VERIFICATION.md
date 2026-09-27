# GrowthOS completion — verification (2026-09-21)

All runs used the local disposable databases (`growthos_test`, `growthos_dev`, marker verified). No production system, provider, payment or message was touched. "Test-verified" = fixtures / stand-ins. Nothing here is live-verified.

## Commands and results
| Check | Result |
|---|---|
| Baseline before changes | typecheck clean · 41 files / 465 tests |
| `npm run typecheck` (final) | clean |
| `npx vitest run` (second pass, files now run sequentially) | **47 files / 521 tests passed** — adds `completion-journey` (6), `completion-operator` (5), `completion-pricing` (3), +2 in `completion-credits` (recovery, source picker) |
| `npx vitest run` (first pass) | 44 files / 505 tests passed (40 new: 25 credits + Studio, 8 delivery entry points, 7 adapter / media-link contracts; 1 existing assertion in v2-adapters reworded for private storage) |
| `next build` (production, isolated `NEXT_DIST_DIR`, local DB) | succeeded; `/app/studio`, `/app/denied`, `/api/os/media`, `/admin/os/credits` compiled |
| Disposable-DB guard | observed failing closed: the suite reported "database blocked … not marked disposable" until `scripts/mark-disposable-db.mjs` was run |
| `npm run seed:growthos-demo` | passed through the marker guard; demo workspace has AI tools, synthetic rate card + pack, 60 included credits |

## How the entry-point tests work
`tests/os/entry-harness.ts` replaces only: the request cookie jar (`next/headers`), `revalidatePath`, `redirect`, `after`, and outbound `fetch` (LLM, image, Stripe checkout). Sessions are real `LosSession` rows; permissions, entitlements, accounting and state machines are not mocked. Webhooks go through the real route handler with a correctly signed body.

## Required credit tests → where
| Requirement | Test (tests/os/completion-credits.test.ts) |
|---|---|
| Wrong tenant | "wrong tenant: another workspace's quote, operation and order are invisible" |
| Wrong role | "wrong role: a member without ai.use cannot quote, run, or buy" |
| Unentitled tool with positive balance | "an unentitled tool is refused even with a positive balance" |
| Entitled tool, insufficient balance / zero balance keeps manual functions | "…offers purchase and leaves manual work untouched" |
| Concurrent wallet / member spending | "parallel runs cannot overspend the wallet"; "a member cap limits a shared wallet atomically" |
| Forged price | "forged price fields are ignored" (+ forged pack fields in the checkout test) |
| Expired / input-mismatched quote | "expired and input-mismatched quotes are refused and hold nothing" |
| Rate change after reservation | "a rate change after the reservation does not move the accepted price" |
| Duplicate submit / job / payment | "duplicate submit…"; first test (double `runOperation`); purchase test (same event twice + related event) |
| Provider failure and timeout | "provider failure…"; "provider timeout (image)…" |
| Crash after provider response before settlement; stale reservation | "crash after the provider call…"; "a queued operation whose job was never enqueued…" |
| Settlement beyond maximum | "settlement above the accepted maximum is refused" |
| Grant expiry with active reservation | "grant expiry never touches credits held by an active operation" |
| Partial output policy | "validator failure and partial output policy" |
| Refund / dispute / related-event dedupe | "partial refund, then a dispute…"; "a dispute we win restores…" |
| Internal staff usage never debits client | "Catalyst internal work never debits the client, through any staff path" |
| Purchase never expands scope | end of "server-priced order…" |

Delivery (tests/os/completion-entry.test.ts): expected denial as screens/statuses incl. workspace switching; `signContract` through the action (staff and admin refused, owner signs, checklist seeded, tools granted only once active); upload through the route incl. type sniffing; signed media link; handover ⇒ read-only, tools gone, export works; three overlapping ticks ⇒ one run. Tenant isolation, approval invalidation, DST, repeated publish workers, uncertain publication, partial thread, recurring cycles and analytics aggregation remain covered by `v2-acceptance` / `v2-rules` at **library level** (unchanged).

## Acceptance walkthrough (brief §17)
| # | Step | Evidence | Level |
|---|---|---|---|
| 1 | Provision engagement with scope + tool entitlements | completion-entry fixture mirrors `proposeContract` (now writes `aiTools`); admin form not clicked | test-verified (fixture) |
| 2 | Client signs through the real action | completion-entry | test-verified (action) |
| 3 | Discovery; missing access blocks only dependent work | v2-acceptance step 3 | test-verified (library) |
| 4–5 | Server quote; reserve and settle once | completion-credits + browser (quoted ≤ 8, charged 3) | test-verified (action + browser, stand-in model) |
| 6 | Insufficient balance offers purchase, manual editing intact | completion-credits | test-verified (action) |
| 7 | Verified test payment grants once despite duplicates | completion-credits (webhook route, signed fixtures) | test-verified (route); Stripe never contacted |
| 8 | Save into goal-linked campaign + variant | completion-credits + browser | test-verified |
| 9–10 | QA/approval applies; editing approved material invalidates | completion-credits last test | test-verified (library calls for QA/approve) |
| 11 | Schedule and execute once via test provider | v2-acceptance step 8 | test-verified (library, TEST adapter) |
| 12–13 | Metrics ↔ publication/campaign; tagged enquiry → opportunity → sale | v2-acceptance 9–12 | test-verified (library) |
| 14 | Internal AI does not debit client | completion-credits | test-verified |
| 15–16 | Recurring once; scope change needs approval | v2-acceptance 13–14 | test-verified (library) |
| 17 | Handover keeps history + export | completion-entry | test-verified (action + route) |
| 18 | Operator inspects usage, failures, reservations, reconciliation | browser render of `/admin/os/credits` | viewed; operator actions not clicked |

## Browser verification (local verification server, dev-only stand-in model)
Signed in with injected throwaway dev sessions (no password typed; operator cookie signed with a local-only secret).
Walked on desktop: AI Studio catalogue (entitled vs unavailable tools, balance), tool page → **Get quote** → **Run** → completed run page (charge vs maximum, flags) → **Save** as master + LinkedIn variant in a campaign → AI credits page (balance split, expiry, usage by tool/member, transactions, caps, staff authorisation, purchases "not open") → `/app/leads` in a no-CRM workspace (**scope screen**, was HTTP 500) → `/app/ops` as a client (**role screen**, was HTTP 500) → `/admin/os/credits`. Mobile 375 px on a tool page: no horizontal overflow, 0 unlabelled inputs. No console errors.

**Not done:** keyboard-only and screen-reader passes; visual QA of the pre-existing screens listed in the requirements file; clicking operator actions; screenshots on disk (the browser tooling returns images inline only — visual verification is therefore **incomplete**, not claimed).

## Second pass (same day)
- Acceptance steps 3, 8–13, 15, 16 now run through server actions, the authenticated tick route and the public form route (`completion-journey`): dependency blocking, DST-shifted schedule, three overlapping scheduler calls → one publication with tagged link, scheduler-driven metric sync, manual metrics refused for clients, tagged vs untagged enquiry, client-recorded sale (staff refused), one recurring cycle, owner-only priced scope change charged once.
- Operator actions, tool entitlement on proposals, grant rules, margin-guarded activation, invoice refund reconciliation (`completion-operator`).
- HTTP smoke of 21 client / staff / operator pages with real sessions: all 200 (one intentional redirect), no error screens. Keyboard: skip link → main, DOM-order tabbing, visible focus, no positive tabindex.
- Test files now run one at a time (`fileParallelism: false`): the scheduler and job queue under test sweep the whole shared database.

## Third pass (same day) — 47 files / 528 tests
- `completion-adapters` +4: X thread media (first post only, no re-upload on resume); LinkedIn multi-image, document (register → PUT → status → post with title; wrong type never sent), video (byte-range parts, ETags in order, finalize, status; failed processing posts nothing).
- `completion-credits` +3: no search key ⇒ no research and an honest label; researched run searches first, drops non-https results, cites, lists sources, charges tool + search; fabricated / missing citation or failed search ⇒ failed, not charged, model not called on a failed search.
- `completion-entry` / `completion-operator`: included credits proposed with tools only, nothing granted on proposal, 40 credits with a 30-day expiry granted exactly once on signature, legacy placeholder ignored.
- Browser (interactive): business profile saved (version 1 → 2, 8 of 12 sections), claim approved by the client, LinkedIn variant approved from the inbox and moved to the decision log, Results labels ("Not available", sessions vs search clicks, attribution limits), Assets upload form fully labelled. File upload itself is covered by the route test (the browser tooling cannot choose a local file).

## Known gaps in test evidence
- No live LLM, image, Stripe, Blob or social provider call has ever run.
- Successful activation of a REAL rate card is proven by the pure margin functions, not by activating one in the shared test database.
