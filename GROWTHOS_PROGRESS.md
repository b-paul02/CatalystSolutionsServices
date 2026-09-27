# GrowthOS upgrade — progress

Statuses: **Implemented and tested** / **Implemented but unverified** / **Externally blocked** / **Not implemented**.
**Resume rule:** after a context reset read this file + `GROWTHOS_IMPLEMENTATION_PLAN.md`, then continue at "Open items". Do not re-audit.

Branch `growthos-v2` (from `growthos` @ c807a23 + the earlier uncommitted admin merge). **Nothing is committed** — the owner has not asked for a commit.
Local DB: see `GROWTHOS_EXTERNAL_SETUP.md`. Last run 2026-09-21: `npm run typecheck` clean · `npx vitest run` 41 files / 465 tests green · demo seeded.

## Requirement matrix

| # | Requirement | Status | Where |
|---|---|---|---|
| A1 | Isolated dev/test DB; fail-closed for app, scripts, tests | Implemented and tested | `lib/dbGuard.ts`, `lib/audit/db.ts`, `tests/setup.ts`, `scripts/seed-setup.ts` |
| A2 | No public key fallback; key version + legacy decrypt + rotation | Implemented and tested (rotation script dry-run only) | `lib/leados/crypto.ts`, `lib/audit/adminAuth.ts`, `lib/partner/auth.ts`, `scripts/growthos-v2-ops.ts` |
| A3 | Server-side entitlement checks: pages, actions, API, jobs | Implemented and tested in lib (read-only mode, publish-time recheck); CRM choke point + API key path implemented but unverified in a browser | `lib/leados/auth.ts`, `lib/leados/apiAuth.ts`, `_os/v2.ts`, `lib/os/publishing.ts` |
| A4 | Tenant-safe relations; staged legacy plan | Implemented and tested (cross-tenant negatives); legacy stage 1 script run locally | `prisma/schema.prisma`, `prisma/changes/2026-09-growthos-v2.md` |
| A5 | Signed, idempotent payment reconciliation | Implemented and tested; live Stripe delivery Externally blocked | `lib/os/commercial.ts`, `app/api/stripe/webhook`, `lib/leados/billing.ts` |
| A6 | Reliable scheduling | Implemented and tested (tick, sweep, stuck-claim recovery, heartbeat); ≥5-min production trigger Externally blocked | `lib/os/tick.ts`, `app/api/os/tick` |
| A7 | Demo data kept out of client reports | Implemented and tested (v2 metrics/outcomes); legacy `/app/reports` fixed, unverified | `lib/os/metrics.ts`, `lib/os/outcomes.ts`, `reports/page.tsx` |
| A8 | Consistent periods, currencies, time zones | Implemented and tested | `lib/os/time.ts`, `lib/os/outcomes.ts` |
| A9 | `deliveredAt`, not `updatedAt` | Implemented and tested; production backfill Externally blocked | `lib/os/work.ts`, `lib/os/entitlements.ts` |
| A10 | AI usage + internal cost, no fake zero | Implemented and tested (console render test); live LLM calls not exercised | `lib/os/ai.ts`, `lib/audit/anthropic.ts`, `admin/os/OpsOverview.tsx` |
| A11 | Self-service enrolment gated | Implemented but unverified (not clicked through) | `(auth)/actions.ts`, `onboarding/actions.ts` |
| B | Engagement lifecycle, holds, payment status, discovery, checklist, owners/deadlines, dependencies, blockers, kickoff, roadmap, service expectations, change requests, cycles, renewal reminders, handover/export | Implemented and tested; UI browser-checked for Home + Engagement | `lib/os/engagement.ts`, `engagement/**`, `strategy/profile` |
| C | Role-specific UX | Implemented; client Home/Content/Approvals/Results/Engagement + staff queue browser-checked (desktop + mobile Home). Assets upload, Settings → Connections, Growth Plan profile, campaign page, lead + work panels, `/admin/os` console: implemented but unverified in a browser | `app/app/(shell)/**`, `components/os/*`, `admin/os/OpsOverview.tsx` |
| D | Shared data and delivery model | Implemented and tested (chain traversal) | `prisma/schema.prisma` |
| E | Service templates (14) | Implemented and tested | `lib/os/templates.ts`, `lib/os/catalog.ts` |
| F | Content Studio lifecycle | Implemented and tested in lib; UI browser-checked. AI draft/rewrite/repurpose: implemented, validators tested, live model not exercised. "Rich long-form editing" = large plain-text editor (Not implemented as a rich-text editor) | `lib/os/content.ts`, `lib/os/channels.ts`, `content/**` |
| G | Assets | Library, versions, rights, access control, export manifest: Implemented and tested (local storage). Vercel Blob: Implemented but unverified. Image generation: Implemented but unverified ("Requires setup" without a provider). Video: human production path implemented; **video generation/rendering adapter Not implemented** (no verified provider API) | `lib/os/assets.ts`, `lib/os/storage.ts`, `lib/os/imagegen.ts`, `assets/**` |
| H | Accounts + publishing | Publisher: Implemented and tested (TEST adapter). Adapters X, LinkedIn member/org, Facebook Page, Instagram post/carousel/Reel, YouTube long/Short, WordPress: contract-tested, **every live provider Externally blocked**. X media posts, Instagram Stories, LinkedIn video/multi-image: Not implemented (manual publication path instead) | `lib/os/adapters.ts`, `lib/os/publishing.ts`, `lib/os/connectors.ts`, `_os/accounts.ts` |
| I | Analytics + outcomes | Snapshots, attribution, opportunities, sales, 3 views: Implemented and tested. Metric adapters: X, YouTube, GA4, Search Console contract-tested; **LinkedIn, Facebook, Instagram metric adapters Not implemented** (manual entry / CSV import, labelled). Grounded narrative wired into `draftReport` (factual summary fallback; AI path not exercised live) | `lib/os/metrics.ts`, `lib/os/outcomes.ts`, `results/page.tsx` |
| J | Commercial + recurring + partner link | Implemented and tested | `lib/os/commercial.ts`, `lib/os/engagement.ts`, `admin/os/actions.ts` |
| K | Verification | 51 new tests; see `GROWTHOS_VERIFICATION.md` | `tests/os/v2-*.test.ts(x)` |
| L | 15-step acceptance | Implemented and tested (test-verified, not live-verified) | `tests/os/v2-acceptance.test.ts` |

## Open items (next session)
2. Browser-check the unverified screens above; keyboard-only and screen-reader pass.
3. LinkedIn organisation + Meta insights adapters (verify current docs first); X media upload.
4. Rich-text editor for long-form, if wanted (needs a dependency decision).
6. Owner decisions in `GROWTHOS_DECISIONS.md` → then the production rollout in `prisma/changes/2026-09-growthos-v2.md`.
