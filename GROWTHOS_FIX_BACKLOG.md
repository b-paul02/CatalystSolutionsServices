# GrowthOS — fix backlog from the post-build audit

Ordered by severity. Each item states whether it is a **code fix** or **external setup**. No fixes were applied during the audit.
Severity: Critical = tenant/money/data-loss/credential exposure · High = required core flow missing or broken · Medium = incomplete
operation or significant usability gap · Low = polish/documentation.

**No Critical findings.** Tenant isolation, money handling and credential fallbacks were probed specifically and held up; nothing was
found that leaks across tenants, moves money incorrectly, loses data or exposes a secret.

---

## H-1 · Client AI Studio does not exist
- **Requirement:** R-AI-01, R-AI-02, R-AI-04, R-AI-05, R-AI-07 — "Clients can use entitled AI tools themselves."
- **Evidence:** `grep` over `app lib prisma components` → 0 hits for an AI studio surface. Audit test: no client role holds
  `work.execute`, `work.manage` or `strategy.manage`, which are the only permissions any AI entry point accepts (`lib/leados/rbac.ts:64-71`).
  Browser: no AI item anywhere in the signed-in client navigation.
- **Reproduce:** sign in as the demo client owner → no AI entry point exists on any page.
- **Expected:** an entitled client opens AI Studio, picks a tool, sees a quote, runs it, gets a draft.
- **Actual:** AI is staff-only production tooling; a client cannot invoke any of it.
- **Client impact:** the headline capability of the latest brief is unavailable to clients.
- **Repair (code, large):** add a client-facing tool catalogue gated on a new tool entitlement (distinct from service scope and from
  credit balance); expose it as a module in the shell nav; route each tool through a quote → reserve → execute → settle pipeline (H-2);
  keep output landing as a draft that still needs approval to publish (that separation already works and should not be loosened).
- **Verification needed:** a client-role runtime test proving a client can run a tool and cannot publish its output without approval.

## H-2 · No AI credit wallet, ledger, quote, reservation or purchase
- **Requirement:** R-AI-03, R-AI-09 → R-AI-16, R-PAY-01.
- **Evidence:** audit test — no Prisma model matches `/wallet|credit|quote|reservation|ratecard|grant/i`. An org whose active contract
  grants `aiCredits: 0` executed AI successfully; 25 concurrent executions produced 25 usage rows and 0 refusals. `allowances.aiCredits`
  is summed at `lib/os/entitlements.ts:50` and read by nothing. Browser: the only purchasable balance is LeadOS **lead tokens**.
- **Reproduce:** run the audit config; see "AI usage is RECORDED but never CHECKED".
- **Expected:** integer wallet, append-only ledger, versioned rate card, quote bound to inputs with an expiry, atomic reservation,
  settlement capped at the authorised maximum, release on failure, purchase via checkout, client-visible history.
- **Actual:** one-way usage recording only; `CosAiUsage` is an audit trail, not an accounting system.
- **Client impact:** AI cannot be sold, metered or capped; unbounded provider spend is possible once real keys are configured.
- **Repair (code, large):** new tables (wallet, ledger, grant, rate card, quote, reservation) with integer minor units; reserve inside the
  same transaction as the balance check; settle against the reservation; release on failure; add `appliedTo: "ai_credits"` to the existing
  `CosPaymentEvent` flow, which already has the idempotency and signature properties needed.
- **Verification needed:** concurrency test proving no overspend; duplicate-purchase test; quote-expiry and input-binding tests;
  reservation-release-on-failure test.

## H-3 · Entitlement and permission refusals render HTTP 500
- **Requirement:** R-SEC-03 (and every page guard).
- **Evidence:** server log — `LosAuthError: Leads and pipeline are not part of this workspace's scope` at `lib/leados/auth.ts:159`
  → `GET /app/leads 500`. Also `LosAuthError: Forbidden` at `auth.ts:151` from `app/app/(shell)/ops/page.tsx:21` → `GET /app/ops 500`.
  There is **no `error.tsx` anywhere in the `app/app` group**.
- **Reproduce:** sign in as the demo client owner → switch to "Northwind Robotics (demo)" (no CRM module) → open `/app/leads`
  → "Application error: a server-side exception has occurred". Same as a client opening `/app/ops`.
- **Expected:** a clear "not part of your scope" page, or a redirect to Home.
- **Actual:** generic 500. Access *is* correctly denied — it fails closed and leaks nothing — but the failure is user-visible and alarming.
- **Client impact:** any client on a multi-engagement account who follows a stale link or bookmark sees a server error. This is a
  regression introduced by the new entitlement gate: before it, those pages loaded.
- **Repair (code, small):** add an `error.tsx` boundary in the `(shell)` group that renders a friendly page for `LosAuthError` by status,
  and in `ops/page.tsx` check `isStaffRole` *before* calling `requireOrg` with a staff-only permission.
- **Verification needed:** runtime check of both reproductions returning a 200 explanatory page, plus a test that the gate still refuses.

## H-4 · Acceptance suite exercises no server action or HTTP route
- **Requirement:** verification integrity for all journey requirements.
- **Evidence:** `tests/os/v2-acceptance.test.ts` contains 67 direct `db.*` writes and imports nothing from `_os/v2.ts`, `_os/actions.ts`
  or any route. Step 2 simulates signing with `db.cosContract.update(...)` under the comment "what signContract does once the owner signs".
- **Expected:** the acceptance path drives the same entry points a user does.
- **Actual:** the library layer is proven; permission checks, form parsing, revalidation and redirects in the action layer are unproven —
  and that is exactly where H-3 was found.
- **Client impact:** green tests overstate confidence; defects in the action layer ship unnoticed.
- **Repair (code, medium):** call the server actions directly with `FormData` in the acceptance test (they are plain async functions), and
  add HTTP-level tests for `/api/os/assets`, `/api/os/export`, `/api/stripe/webhook` and `/api/os/tick`.
- **Verification needed:** the same 15 steps passing through actions rather than raw writes.

## H-5 · AI usage has no internal-vs-client-billable distinction
- **Requirement:** R-AI-15 — "Catalyst internal AI production does not silently consume client-purchased credits."
- **Evidence:** `lib/os/ai.ts:187` writes `CosAiUsage` with the client's `orgId` and no billable/internal flag; the operator console
  aggregates by `orgId` only.
- **Expected:** every AI execution is attributed to a payer — Catalyst internal or the client's wallet.
- **Actual:** all usage is recorded against the client org regardless of who ran it or why.
- **Client impact:** today nothing is charged (no wallet), so no client is harmed. The moment H-2 lands, Catalyst's own drafting would
  silently debit the client. Fixing this **before** the wallet is far cheaper than after.
- **Repair (code, small now / large later):** add a `payer` column (`internal` | `client`) set from the actor's role and the feature, and
  make the wallet debit only `payer = client`.
- **Verification needed:** test that a staff-initiated draft never debits the client wallet.

---

## M-1 · Nothing schedules `/api/os/tick` (external setup + one-line config)
`vercel.json` still contains only `/api/cron/nurture` and `/api/leados/cron`, both daily. Scheduled publishing, recurring cycle
generation, renewal reminders, approval expiry and metric syncs therefore never fire in a deployed environment. The endpoint itself is
correct and authenticated (401 without a bearer, verified). **Repair:** add the cron entry (needs a Vercel plan that allows sub-daily) or
point an external scheduler at it; the `/admin/os` staleness banner already exists to make a failure visible.

## M-2 · "Production asset storage" cannot run
`@vercel/blob` is not installed, so selecting `ASSET_STORAGE=vercel_blob` throws "Asset storage is not set up". Instagram and Facebook
publishing both require a public media URL and so are blocked behind this. **Repair:** install the dependency and configure the token
(external setup), then exercise one upload and one publish.

## M-3 · All seven channels and both analytics sources are fixture-verified only
Adapter shapes were checked against provider documentation on 2026-09-21 and against fixtures, but **no live round-trip has ever run**.
Endpoint shapes, scopes and versions drift. **Repair:** external setup per `GROWTHOS_EXTERNAL_SETUP.md`, then one publish + one metric
sync per provider, recorded with dates.

## M-4 · No refund, chargeback or dispute handling
`handleStripeEvent` handles `checkout.session.completed` / `async_payment_succeeded` only. A refund or dispute after credits or a payment
were applied leaves the record overstated. **Repair (code, medium):** handle `charge.refunded` and `charge.dispute.created`, reversing
through the same append-only path.

## M-5 · No error boundary in the `app/app` group
The root cause behind H-3, and it also turns an unauthenticated race between layout redirect and page guard into a 500 (observed in the
log for `/app/dashboard`). **Repair (code, small):** one `error.tsx`.

## M-6 · Image generation never executed
`lib/os/imagegen.ts` is untested and unexercised; the UI correctly says "Requires setup". **Repair:** configure a provider, then exercise
once and confirm the asset lands as an internal AI-generated draft.

## M-7 · Operator console not verified through the browser
`/admin/os` is behind the admin password, which the auditor did not have. A render test covers its queries and markup. **Repair:**
a human should walk it once, or provide a dev admin account.

---

## L-1 · Checklist labels are snapshotted at instantiation
The seeded demo still shows "Claims, results and proof you are happy for us to use" after the template label changed to "Approved claims
and source material". Rows are instances, so this is by design, but a label correction never reaches live engagements. **Repair:** either
render the label from the template when a `key` matches, or provide a one-off relabel script.

## L-2 · Screenshots could not be written to disk
The browser tooling returns images inline and cannot save files, so `growthos-audit-evidence/` holds textual state captures instead.
Visual QA and any accessibility claim remain outstanding — keyboard-only and screen-reader passes were **not** performed.

## L-3 · Secret rotation status unknown
The 2026-09-18 chat exposure is recorded in `GROWTHOS_DECISIONS.md` as an owner action. This audit found no evidence either way and
does not assert it is unresolved. **Repair:** confirm rotation and record the date.

---

## Suggested sequence
1. **H-3 + M-5** — one small change removes a client-visible 500 on a legitimate path. Do this before any demo.
2. **H-5** — add the payer flag now, while it is a one-column change.
3. **M-1** — wire the scheduler; without it, half the delivery automation is inert.
4. **H-4** — retarget the acceptance suite at the action layer so the next audit finds defects earlier.
5. **H-1 + H-2** — design and build the AI Studio and credit economy together; they are one feature, not two.
6. **M-2 → M-3** — storage, then live-verify channels one at a time, recording each.
