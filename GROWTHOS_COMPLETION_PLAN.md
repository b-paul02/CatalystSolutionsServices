# GrowthOS completion — plan

Started 2026-09-21 on branch `growthos-v2` (HEAD c807a23, large uncommitted tree — preserved, never reset).
Baseline before any change: `npm run typecheck` clean · `npx vitest run` 41 files / 465 tests green (local `growthos_test`).
**Resume rule:** read `GROWTHOS_COMPLETION_PROGRESS.md` first; it holds the exact next step. Do not re-audit.

## Four independent controls (never merged)
| Control | Source of truth | Code |
|---|---|---|
| Service scope | ACTIVE `CosContract.services/modules` | `lib/os/entitlements.ts` |
| Tool entitlement | ACTIVE `CosContract.aiTools` | `lib/os/entitlements.ts` → `ent.aiTools` |
| Credit balance | `CosCreditGrant.remaining` − active `CosCreditReservation` | `lib/os/credits.ts` |
| Action permission | RBAC matrix (`ai.use`, `org.billing`, `approvals.decide`, …) | `lib/leados/rbac.ts` |

## Phases
1. **Schema (additive)** — `CosCredit*`, `CosAiOperation`, `CosAiAttempt`, `CosAiBillingAuth`, payer columns on `CosAiUsage`, `CosContract.aiTools`, payment-intent column on `CosPaymentEvent`. Change note: `prisma/changes/2026-09-growthos-ai-credits.md`.
2. **Credit accounting** — `lib/os/credits.ts`: wallet lock, grants, ledger, reservations, quotes, settle/release, member caps, expiry, deficit, invariant check.
3. **AI Studio engine** — `lib/os/studio.ts`: tool catalogue, payer rules, quote → reserve → queue → attempt → persist → settle/release, stale reconciliation, save-to-campaign/variant/asset/work.
4. **Credit purchases** — `lib/os/creditPurchase.ts`: packs, orders, checkout, webhook grant, refund/dispute reconciliation (order-independent, cumulative).
5. **Client + operator UI** — `/app/studio`, `/app/studio/[id]`, `/app/settings/ai-credits`, `/admin/os/credits`.
6. **Reliability** — denied/unauthenticated handling without 500s, error boundaries, tick lock + scheduler config + local scheduler, `@vercel/blob` + signed time-limited media delivery, explicit disposable-DB marker.
7. **Platform/analytics gaps** — LinkedIn/Facebook/Instagram metric adapters, X media, capability matrix.
8. **Entry-point tests** — server actions and routes with only `next/headers`, `next/cache`, `next/navigation` and provider `fetch` mocked.
9. **Browser verification, docs, handoff.**

Order rationale: payer flag and accounting land before any client can run AI, so internal work can never debit a wallet.
