# GrowthOS — independent post-build verification

Audit date: 2026-09-21 · Auditor: same agent, adversarial pass · Branch `growthos-v2` · HEAD `c807a230460ef0c3eb36371564f3d9f97236a7c2`
Working tree: **30 tracked files modified, 50 untracked paths — nothing committed.** All inspected, including untracked implementation files.
Target for every write: the isolated local `growthos_test` database (verified `localhost` + name ends `_test` before any write). No production system, provider, payment or message was touched. No application code or configuration was changed by this audit.

---

## 0. HEADLINE — WHICH BRIEF WAS BUILT

**The implementation follows the EARLIER brief. The later AI-credit brief is absent from the build.**

The latest brief requires client-operated AI tools and purchasable, quoted, authorised AI credits. Neither exists. This is not a
gap in polish — the feature set is not present in any layer.

| Probe | Result |
|---|---|
| `grep -riE "ai.?studio\|aiWallet\|CosCredit\|creditLedger\|buy.?credits"` over `app lib prisma components` | **0 hits** |
| Prisma models matching `/wallet\|credit\|quote\|reservation\|ratecard\|grant/i` | **none** (audit test, §3) |
| Client roles holding any permission an AI entry point requires | **none** (audit test, §2) |
| Purchasable balance offered in the product UI | **LeadOS lead tokens only** — "Tokens pay for lead deliveries and B2B reveals" (browser, `/app/settings/billing`) |
| What the new Stripe webhook settles | lead tokens · LeadOS subscription · engagement invoice · marketing deposit — **no AI credit path** (`lib/os/commercial.ts:145-159`) |

What exists instead is **staff-only AI production tooling with one-way usage recording**:
- Six AI entry points (`draftPlan`, `fillCalendar`, `aiDraft`, `newSeoBrief`, `variantsAiDraft`, `generateImage`), each requiring
  `work.execute`, `work.manage` or `strategy.manage`.
- `lib/leados/rbac.ts:64-71` excludes all three from `ALL` (the client-role grant). Therefore **no client role can invoke any AI feature.**
- `CosAiUsage` records what was spent after the fact. `allowances.aiCredits` is summed in `lib/os/entitlements.ts:50` and **never read by any
  enforcement path** — proven at runtime: an org with `aiCredits: 0` executed AI 26 times, every call recorded, none refused.

The completion notes did not claim an AI Studio or credits, and the tracking files do not list them — so this is a **brief-coverage gap, not a
false claim**. It is nonetheless the single largest distance between the build and the latest requirements.

---

## 1. CHALLENGING THE COMPLETION CLAIMS

| Claim | Supporting implementation | What the test actually asserts | Runtime evidence | Accurate qualification |
|---|---|---|---|---|
| "465 tests across 41 files", "51 new" | 4 new files | — | Re-run: **41 files / 465 passed**; new = 17+18+14+2 = **51** | **Accurate.** |
| "15 required acceptance steps" | `tests/os/v2-acceptance.test.ts` | 17 `it()` blocks covering steps 1–15 + 8b/8c | All pass | **Accurate in coverage, weak in method** — see below |
| "Client and staff journeys work end-to-end" | server actions + pages | Acceptance suite contains **67 direct `db.*` writes and imports no server action or HTTP route** | Browser walk-through of client journey succeeded via real login | **Overstated.** Library layer is end-to-end; the action/HTTP layer is not covered by tests |
| "Production asset storage implemented" | `lib/os/storage.ts` Vercel Blob adapter | 0 tests touch the `vercel_blob` path | `@vercel/blob` **not installed**; selecting it throws "not set up" | **Implemented, not runtime-verified** — and non-functional until a dependency is added |
| "Image generation implemented" | `lib/os/imagegen.ts` | 0 tests | No provider configured; never executed | **Implemented, not runtime-verified** |
| "Analytics implemented" | snapshots, 3 views, adapters | Snapshot maths + fixture-shaped adapter contracts | Browser: per-publication metrics render from the TEST adapter | **Partially implemented** — real platform sync unverified; LinkedIn/Facebook/Instagram metric adapters absent |
| "Billing implemented" | `lib/os/commercial.ts`, webhook | Signature, duplicate, amount-mismatch — all pass | HTTP: unsigned + bad-signature webhook → **400** | **Accurate for engagement invoices + lead tokens.** No AI-credit purchase exists |
| "Scheduler implemented" | `lib/os/tick.ts`, `/api/os/tick` | Heartbeat staleness test passes | HTTP: no/wrong bearer → **401** | **Implemented but not wired** — `vercel.json` still schedules only the two daily crons; `/api/os/tick` is scheduled nowhere |

### How the acceptance steps were actually simulated
Step 2 — the single most important client action, signing scope — is performed as:
```
db.cosContract.create({... status: "proposed" })
db.cosContract.update({... status: "active", signedById, signedAt })   // "what signContract does once the owner signs"
E.acceptEngagementBySignature(...)
```
The real `signContract` server action (which enforces `contract.sign`, wraps both writes in a transaction and seeds the checklist) is
never called. The same pattern holds throughout: internal library functions are exercised, entry points are not. `processSubmission`
(step 10) is the one real shared path, though the HTTP route wrapping it is still untested.

**Consequence:** permission checks, form parsing, `revalidatePath`, redirect behaviour and entitlement guards inside the action layer
carry no automated coverage. Several of these are where the defects below were found.

---

## 2. CLIENT AI STUDIO — **Absent from inspected scope**

Traced the required request path; it breaks at the first step.

| Step | Expected | Found |
|---|---|---|
| Client discovers/opens AI Studio | nav entry + page | **No route, no nav item.** `find "AI"` on the signed-in client surface returns only incidental substrings ("c**a**mp**ai**gn", "Cl**ai**ms", "aw**ai**ting") |
| Tools available to a client | tool catalogue | none — all six AI actions are staff-permissioned |
| Price/credit quote shown before running | quote record | **no quote concept anywhere** |
| Generate → queued → output → saved | job + result | staff-only; `variantsAiDraft` creates variants synchronously, no queue, no client entry |
| Insufficient credit behaviour | refusal | **nothing to refuse against** |
| Failed execution behaviour | refund/release | usage row written with `ok:false`; no release because nothing was reserved |
| Regeneration / repeated clicks | idempotency | **no request id, no idempotency** on AI actions |
| Save to campaign/variant/work item | linkage | exists (staff path): drafts land as `CosContentVariant` |
| Draft vs publish authority | separation | **correct** — AI output is always a draft; publishing needs approval + `gateAction` |

**Admin AI drafting ≠ client AI tool.** The build has the former only. The separation of "draft authority" from "publish authority" —
the part of the brief the build *does* satisfy — is real and well enforced, and is the right foundation to hang a client studio on.

---

## 3. AI WALLET AND ACCOUNTING — **Absent from inspected scope**

| Required element | Found |
|---|---|
| Org-owned AI wallet, balance | **absent** |
| Separate from LeadOS lead tokens | lead tokens exist and are separate — but there is nothing to separate them *from* |
| Append-only credit ledger | **absent** (`LosTokenLedger` is the lead-token ledger) |
| Purchased / included / promotional grants | **absent** |
| Reservations, atomic balance check | **absent** |
| Versioned rate cards, quotes, quote expiry, input binding | **absent** |
| AI execution records | `CosAiUsage` — recording only |
| Provider usage/cost records | `inputTokens`/`outputTokens`/`costMicros`; **`costMicros` is `null` unless `LLM_PRICE_*` is set** (honest "unknown", never a fake 0) |
| Purchase orders, payment events | `CosPaymentEvent` exists but has **no AI-credit `appliedTo` value** |
| Refunds / reversals | absent for AI |
| Member limits, billing permission | `org.billing` exists for lead tokens only |
| Internal vs client-billed usage | **absent — and this is a design landmine (see H-5)** |
| Client balance + transaction history | absent |
| Operator configuration | absent |

Runtime proof (audit test, isolated DB):
- Org with an **active contract granting `aiCredits: 0`** executed `metered()` successfully; the value came back and a usage row was written.
- **25 concurrent** executions → 25 rows, 0 refusals. There is no balance, so "no overspending under concurrency" is vacuously true today
  and gives no assurance about a future wallet.
- Crediting 500 lead tokens changed no AI capability, no service entitlement and no module — so "credits do not expand entitlements"
  holds, again vacuously.
- **Zero balance preserves manual function:** confirmed — a client could still raise a change request and staff could still create work.

---

## 4. PURCHASES AND PAYMENT CORRECTNESS — **Partially implemented**

There is no credit-package checkout. What exists and was verified:

| Case | Result |
|---|---|
| Unsigned webhook POST | **400** (HTTP, live dev server) |
| Bad-signature webhook POST | **400** |
| Valid signature, correct amount+currency | applies once; `appliedTo: commercial_record` (acceptance step 14) |
| Duplicate event id replay | second call returns `duplicate: true`, no double credit |
| Amount/currency mismatch vs the record | `appliedTo: unmatched`, no money applied |
| Browser closed after payment | webhook path is independent of the redirect; a unique claim row prevents the redirect path double-crediting |
| Timestamp outside tolerance (replay) | rejected (`v2-rules`) |
| Refunds, chargebacks, partial refunds | **absent from inspected scope** — no handler for `charge.refunded`/`charge.dispute.*` |
| Out-of-order events | not handled explicitly; last writer wins on the record |
| Forged success URL | `settleCheckoutSession` re-fetches the session from Stripe and checks `metadata.orgId` — **not exploitable by URL alone** |

Purchase vs engagement billing is cleanly separated: lead tokens credit `LosTokenLedger`; engagement invoices update
`CosCommercialRecord` + `CosPaymentEvent`. **Live Stripe delivery was never exercised** (no keys locally, by design) — fixture-level only.

---

## 5–7. DELIVERY, CONTENT, ANALYTICS

Verified in isolated runtime (library + browser). Highlights and limits:

- **Journeys:** partner/direct/audit entry, multiple engagements, stage machine, holds with reasons/owners, readiness, checklist,
  dependencies, responsibility split, scope change → owner-only commercial approval, recurring cycles (idempotent under 4 concurrent
  calls), renewal reminders, handover → read-only + export. All exercised at library level; Home/Engagement/Approvals walked in the browser.
- **Templates are instantiated, not just catalogued:** `instantiateProject` creates a project + one milestone per gate with roles,
  acceptance criteria and dependency edges — confirmed on the seeded website build (9 milestones, launch blocked on DNS access).
- **Content:** master → variants with independent approvals; editing an approved variant revokes **only that variant's** approval and
  cancels its schedule; a brief change only flags siblings. Revision snapshots persist. Verified in runtime and in the browser.
- **Publishing:** atomic claim proven under 10 concurrent workers → exactly one publish. Retryable vs uncertain vs definite outcomes
  behave correctly; uncertain is never auto-retried. **All of this is against the TEST adapter — no real platform was contacted.**
- **Analytics:** lifetime totals are not summed across days, daily increments are; missing metrics are absent rather than 0; demo rows
  excluded from real workspaces; currencies never mixed. Search Console clicks are labelled "Search clicks … a different thing from
  website sessions" and GA4 sessions are labelled separately — **the mislabelling traps named in the brief are avoided.** Reach is marked
  non-additive and is never rolled up.
- **Full chain traced** on synthetic data: engagement → goal → campaign → master → variant → publication → tagged link → hosted-form
  enquiry → opportunity → won sale with amount, currency and close date.

### Platform matrix

| Platform | Draft generation | Media production | Direct publishing | Scheduling | Analytics | Manual fallback | Live verification |
|---|---|---|---|---|---|---|---|
| YouTube long-form | AI script (text) | **none** (human upload to Assets) | code: resumable upload | yes | code: statistics + watch time | yes | **never** |
| YouTube Shorts | AI script | none | code (same API) | yes | code | yes | **never** |
| X text | yes | n/a | code | yes | code (`public_metrics`) | yes | **never** |
| X thread | yes | n/a | code (reply chain, resumable) | yes | code (first post) | yes | **never** |
| X image/video | yes | none | **not implemented** (explicitly refused) | — | — | yes | n/a |
| LinkedIn personal | yes | n/a | code (versioned Posts API) | yes | **not implemented** (restricted scope) | yes | **never** |
| LinkedIn company | yes | n/a | code (same API, org URN) | yes | **not implemented** | yes | **never** |
| LinkedIn image | yes | none | code (initializeUpload → PUT) | yes | — | yes | **never** |
| Facebook Page | yes | none | code (`/feed`, `/photos`) | yes | **not implemented** | yes | **never** |
| Instagram post/carousel/Reel | yes | none | code (container → status → publish) | yes | **not implemented** | yes | **never** |
| WordPress | yes | none | code (REST, status=publish) | yes | n/a | yes | **never** |
| GA4 / Search Console | n/a | n/a | n/a | n/a | code (runReport / searchAnalytics) | manual + CSV | **never** |

Scripts are never presented as videos (a video format refuses to leave QA without a finished file from Assets — asserted in tests and
visible in the UI). RSS reading is not counted as YouTube integration. Manual metrics are labelled "Entered by a team member".

---

## 8. AUTHENTICATION AND ENVIRONMENT

| Check | Result |
|---|---|
| Normal seeded login through the sign-in form | **Verified** — email+password → `/app/dashboard` as the client owner (not an injected session) |
| Cross-tenant asset read | refused (audit test) |
| Cross-tenant export | tenant-scoped (audit test) |
| Client role creating delivery work | refused — `Forbidden` (audit test) |
| Client role opening the staff queue | **refused, but with an HTTP 500** — see H-3 |
| Org without CRM opening `/app/leads` | **refused (entitlement gate works), but with an HTTP 500** — see H-3 |
| `/api/os/tick` no / wrong bearer | **401** |
| `/api/stripe/webhook` unsigned / bad signature | **400** |
| `/api/os/export`, `/api/os/assets`, asset upload — unauthenticated | **401** |
| `/api/os/hooks/<bad token>` | 202 `accepted:false`, nothing runs — deliberate anti-enumeration, **not a defect** |
| Registration gating | code requires a pending invitation unless `GROWTHOS_SELF_SERVICE=on`; **not exercised** |
| Test adapter in production | `testAdapterEnabled()` requires `NODE_ENV !== production` **and** an explicit env flag — fails closed |
| Local DB guard | **Verified** — pins to `localhost` + `_test`, else an unreachable sentinel |
| Credential fallback removal | `"dev-secret"` gone from field encryption and both session signers; legacy ciphertext still decrypts (tested) |
| Secret rotation status | **Unknown.** The 2026-09-18 chat exposure is a historical note; this audit found no evidence either way and does not assert it is unresolved |

---

## 9. CHECKS EXECUTED vs BLOCKED

**Executed:** full suite 41 files/465 tests on the isolated DB · 8 purpose-built audit checks (AI permissions, schema absence,
zero-allowance execution, 25-way concurrency, token separation, cross-tenant assets/export/work, zero-balance manual function) ·
8 HTTP negative checks against the live dev server · real form login · browser walk of Home, Content calendar, content piece with
variants, Approvals (decision made through the UI), Results (all three views), Engagement, Settings→Billing, staff queue · org switch
into a workspace without CRM · mobile viewport (375 px) · server-log inspection of every error raised.

**Blocked:** every live provider round-trip (no credentials — externally blocked) · live Stripe delivery · Vercel Blob (dependency not
installed) · image generation (no provider) · LLM-backed drafting (keys blanked locally by design) · `/admin/os` operator console
(admin password not available to the auditor; covered by a render test instead) · keyboard-only and screen-reader passes were **not**
performed — no accessibility claim is made · screenshots could not be written to disk by the browser tooling, so durable evidence is
textual (`growthos-audit-evidence/`).

---

## 10. VERDICT

| Question | Answer |
|---|---|
| **Complete against the latest brief?** | **No.** Client AI Studio and the entire AI-credit economy are absent. Everything else in the brief is present to a good standard. |
| **Ready for an internal demo?** | **Yes**, with a script that avoids `/app/leads` on a non-CRM workspace and `/app/ops` as a client. The seeded demo tells a coherent story. |
| **Ready for a limited client pilot?** | **Not yet.** Blocking: H-3 (500s on a legitimate client path), M-1 (nothing schedules publishing), and at least one live-verified channel. A pilot confined to manual publication with a scheduled tick would be defensible. |
| **Ready for production?** | **No.** No provider is live-verified, no scheduler is wired, asset storage is uninstalled, and no live payment has ever settled. |

### Ten most important findings
1. **H-1** Client AI Studio absent — no client role can invoke any AI feature (permission matrix denies all three AI permissions to every client role).
2. **H-2** AI credit wallet, ledger, quotes, reservations, grants and purchase are absent; `aiCredits` is summed and never enforced (proven: 26 executions at a zero allowance).
3. **H-3** Entitlement and permission refusals render **HTTP 500**, not a graceful page — reproduced on `/app/leads` (org without CRM) and `/app/ops` (client role). Fails closed, so no data leak, but a real client on a multi-engagement account hits it.
4. **H-4** The acceptance suite exercises **no server action or HTTP route** — 67 direct DB writes; contract signing is simulated.
5. **H-5** `CosAiUsage` has no internal-vs-client-billable flag, so Catalyst's internal drafting is recorded against the client's org — this would silently bill clients the moment credits exist.
6. **M-1** `/api/os/tick` is scheduled nowhere; `vercel.json` still has only the two daily crons — scheduled publishing, recurring cycles and renewal reminders would not run when deployed.
7. **M-2** "Production asset storage" cannot run: `@vercel/blob` is not installed. Instagram and Facebook publishing depend on it.
8. **M-3** All seven channels and both analytics sources are **fixture-verified only**; zero live round-trips.
9. **M-4** No refund, chargeback or dispute handling on the payment path.
10. **M-5** No error boundary anywhere in the `app/app` group, which is what turns every `LosAuthError` into a 500.

### Does the AI Studio and credit purchase system actually exist?
**No.** Neither exists in any layer — no UI, no route, no action, no table, no ledger, no quote, no purchase. The only purchasable balance
in the product is the pre-existing LeadOS **lead token**, which the brief explicitly excludes from counting. The AI that does exist is
staff-only production tooling whose cost is recorded after the fact and never checked against anything.

### Audit outputs
- `GROWTHOS_POSTBUILD_VERIFICATION.md` (this file)
- `GROWTHOS_REQUIREMENT_MATRIX.csv`
- `GROWTHOS_FIX_BACKLOG.md`
- `growthos-audit-evidence/` — `audit-checks.test.ts`, `vitest.audit.config.ts`, `audit-checks-run.txt`, `vitest-full-run.txt`, `http-negative-checks.txt`
