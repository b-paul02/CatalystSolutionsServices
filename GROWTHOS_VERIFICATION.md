# GrowthOS upgrade — verification record

Only checks that were actually executed are listed as passed. Date: 2026-09-21. Target: local disposable Postgres
(`growthos_test` for tests, `growthos_dev` for the browser). **No production system, provider, payment or message was touched.**

## Commands
| Command | Result |
|---|---|
| `npm run typecheck` | clean |
| `npx vitest run` (41 files) | **465 passed, 0 failed**, ~13 s |
| `npm run seed:growthos-demo` | passed — 2 demo workspaces, 3 demo users |
| `scripts/growthos-v2-ops.ts check-links` / `backfill` / `rotate-keys` (dry-run, dev DB) | ran; 0 orphans, nothing to backfill on a fresh DB |
| `npx prisma validate` + `db push` to both local DBs | in sync |

Baseline before any change: 37 files / 414 tests green on the same local DB (they previously ran against the hosted production
database, where one unidentified test failed intermittently; on the local DB no flake was observed in 6 full runs).

## New test files
| File | Tests | Covers |
|---|---|---|
| `tests/os/v2-rules.test.ts` | 18 | db guard fails closed · key versioning, legacy decrypt, no public fallback · DST gap/overlap, half-hour zones, period bounds · channel limits, "a script is not a video", hash materiality, tagged URLs, duplicate fingerprint · Stripe signature (wrong secret, altered body, replay, missing secret) · money in minor units · derived payment status · engagement transitions · cycle periods · all 14 templates consistent · unsupported-claim and invented-number checks · metric dimension keys |
| `tests/os/v2-acceptance.test.ts` | 17 | the 15 required acceptance steps + 8b/8c (below) |
| `tests/os/v2-adapters.test.ts` | 14 | request/response **contract fixtures** for X (thread reply chain, resume without re-posting, failure classes, metrics), LinkedIn member + organisation (versioned Posts API, image upload, missing id = uncertain), Facebook Page, Instagram carousel + Reel, YouTube resumable upload + statistics/analytics, WordPress, GA4 |
| `tests/os/v2-console.test.tsx` | 2 | operator console renders against the DB (unknown AI cost is not shown as 0) · scheduler heartbeat staleness |

## Required end-to-end acceptance (brief §L) — `tests/os/v2-acceptance.test.ts`
External steps use the explicit TEST adapter ⇒ **test-verified, not live-verified**.
| # | Step | Status |
|---|---|---|
| 1 | Staff provisions an engagement from a partner opportunity; concurrent/repeat linking yields one engagement; another org cannot take the deal | test-verified |
| 2 | Client gets the right scope + onboarding requests; only a signature accepts; shared intake asked once; passwords refused | test-verified |
| 3 | Missing access blocks dependent work, independent work continues; milestone order enforced; access cannot be ticked without a verified connection | test-verified |
| 4 | Goal → campaign (stable code) → delivery plan; cross-tenant refused | test-verified |
| 5 | Source-grounded master → separately editable variants; revisions kept; script ≠ video; another tenant's account refused; duplicate copy detected | test-verified |
| 6 | Internal QA before client approval; specialist cannot pass own QA; staff and other tenants cannot approve | test-verified |
| 7 | Editing an approved variant revokes ITS approval and cancels its schedule; brief change only flags; sibling untouched | test-verified |
| 8 | Schedule in workspace zone (DST gap reported), reschedule, 10 concurrent workers ⇒ exactly one publish, tagged link in the posted text | test-verified (TEST adapter) |
| 8b | 503 retried once then published; ambiguous outcome never retried and reconciled by a person with evidence; partial thread cannot be restarted | test-verified |
| 8c | Publish-time kill switch; account without publish capability refused; manual publication recorded with evidence and still needs approval | test-verified |
| 9 | Publication ↔ synced/imported metrics; lifetime totals not summed; daily increments summed; demo rows excluded from real reports; unsupported metric absent | test-verified |
| 10 | Campaign-tagged link → hosted-form enquiry; unknown tags never trusted | test-verified (real `processSubmission`) |
| 11 | Enquiry → opportunity → recorded sale; whole chain traversed engagement → goal → campaign → variant → publication → lead → sale | test-verified |
| 12 | Reports keep source, date, currency, attribution limits; INR and USD never mixed | test-verified |
| 13 | Recurring cycle generated once under 4 concurrent calls; one fee per cycle; pause skips; `deliveredAt` not `updatedAt`; AI cost unknown ≠ 0 | test-verified |
| 14 | Out-of-scope request → owner-only commercial approval → one commercial record (replay-safe) → signed webhook pays once; wrong amount unmatched | test-verified |
| 15 | Asset rules (type sniffing, staff-only, cross-tenant); handover ⇒ read-only, history + approvals intact, client export without internal notes | test-verified |

## Browser verification (local dev DB, synthetic demo)
Signed in through local dev sessions as the demo client owner and the demo account lead. Checked: Home (engagement status, requests,
decisions, updates) · Content calendar with filters · master + variants page (previews with tagged links, approval states, comments,
TEST-labelled publication) · Approvals — **approved a LinkedIn variant through the UI** and saw it move to the decision log ·
Results → business outcomes (enquiries by attribution, ₹ sales, "Not available" where no source) · Engagement page (stages, checklist,
roadmap) · staff "My queue" · mobile viewport (375 px) of Home.
**Not browser-verified:** `/admin/os` operator console (behind the admin password — covered by a render test instead), Assets upload
through the browser, Settings → Connections forms, Growth Plan profile, campaign page, lead opportunity panel, work-item dependency
panel (all typecheck and their server logic is covered by the acceptance test), keyboard-only traversal, screen-reader pass.

## Not verified at all (externally blocked)
Every real provider round-trip (OAuth, publish, metrics) · Stripe live/test-mode webhook delivery · Vercel Blob storage ·
image generation · LLM-backed drafting (keys blanked locally; validators are unit-tested) · a ≥5-minute production scheduler ·
applying the schema to production.
