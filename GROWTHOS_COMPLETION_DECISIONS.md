# GrowthOS completion — decisions

Routine choices made while completing the build, with the reason. **OWNER** = needs a business decision. Earlier decisions: `GROWTHOS_DECISIONS.md`.

## Four controls, kept apart
1. **Service scope** = active `CosContract.services/modules`. **Tool entitlement** = active `CosContract.aiTools` (new column, explicit list, signed by the client like any scope). **Credit balance** = wallet. **Action permission** = RBAC (`ai.use` new; `org.billing` buys; `team.manage` sets caps; approvals unchanged). No code path derives one from another; tests prove: positive balance + unentitled tool ⇒ refused; purchase ⇒ entitlements identical before/after; handover ⇒ tools gone whatever the balance.
2. `ai.use` was added rather than granting clients `work.execute` / `work.manage` / `strategy.manage`. Holders: owner, admin, campaign_manager, cgo_lead, cgo_specialist. Saving a Studio draft uses a narrow `studioDraft` path in `createWorkItem` / `createVariant` (content type only, must be in scope, lands in `backlog`/`draft`). A client still cannot move it past QA.

## Accounting
3. Integer credits; ledger append-only; every mutation under `SELECT … FOR UPDATE` on the wallet row. Invariants I1–I7 are written at the top of `lib/os/credits.ts` and checked by `walletInvariant` (tests + operator page).
4. **Reservations take credits out of specific grants** (soonest-expiring first; promotional → included → adjustment → purchased). Expiry only touches `remaining`, so credits held by a running operation can never be expired; an unused remainder that returns to a lapsed grant goes on the next sweep.
5. **Purchased credits do not expire.** Included/promotional grants require an explicit choice in the operator form: a date, or "does not expire". Expiry is shown to the client.
6. **Member caps** are monthly (workspace time zone), counted as held + settled, checked inside the same lock as the balance. They never add credits.
7. **Deficit policy** (refund/dispute after credits were used): usage history stays; the shortfall is recorded as `wallet.deficit`; metered AI pauses with a plain explanation; the next grant pays the deficit first; **no card is ever charged automatically**; nothing is deleted.
8. **Quote** = server row bound to tenant, user, tool, sha256 of whitelisted inputs (output limit included), model, max output tokens, payer/purpose/authorisation and rate-card version; 10-minute expiry; single use. Execution re-validates entitlement, authorisation and availability *now*. Price is `base + ceil(maxTokens/1000 × perK)`; the charge uses the provider's reported output tokens (estimate = characters ÷ 4 when it reports none), never above the quote, always on the card the quote pinned.
9. **Lifecycle**: reserve + operation row + quote claim in one transaction → job queued (and `after()` starts it immediately) → atomic `queued→running` claim → provider call with no transaction open → output stored, then complete + settle in one transaction (3 tries; see decision 30). A duplicate job, overlapping tick or queue retry finds the claim taken and does nothing.
10. **Failure policy**: provider error, timeout, validator failure or empty output ⇒ operation `failed`, reservation released, client not charged, provider tokens/cost still recorded on Catalyst's side (`cost = NULL` when unknown). **Partial output** (e.g. some calendar entries dropped by validators) is delivered with flags and charged on actual output. **Regeneration is a new quote.**
11. **Uncertain**: a row still `running` after 15 min lost its worker around the provider call. It becomes `uncertain`, credits stay **held**, staff are notified, the client sees "held, not spent". Superseded in part by decision 30: a run whose draft WAS stored is recovered and charged once; only a run with no stored output becomes `uncertain`, and its only honest resolution is "close without charge" (reason mandatory, audited).

## Who pays
12. `payer` (`client_wallet` | `catalyst_internal`) and `billingPurpose` are stored on quotes, operations and usage rows, next to the initiating user and the client org. Decided from **purpose + explicit authorisation**, not role: client member ⇒ client wallet; staff ⇒ Catalyst unless they choose "client's credits" AND a live `CosAiBillingAuth` exists. That authorisation is created only by a client billing user (ceiling, end date, note), is revocable, and its ceiling is enforced inside the wallet lock. System jobs ⇒ Catalyst.
13. All six pre-existing staff AI paths go through `metered()`, which now defaults to `catalyst_internal`. Historical `CosAiUsage` rows default the same way and are never converted to debits.
14. Staff internal Studio use is not limited by the client's tool entitlement (Catalyst pays) and reserves nothing (`maxCredits 0`), but is still a recorded operation with provider usage.

## Payments
15. Three products, one signed webhook: lead tokens (`LosTokenLedger`), engagement invoices (`CosCommercialRecord`), AI credits (`CosCreditOrder` → grant). Credit events are tried first and matched on order id + session id + amount + currency + live/test mode + org.
16. The success page only **reads** order status. There is no redirect-side settlement for credits (unlike the legacy lead-token fast path).
17. Refund/dispute handling is **target-based**: target reversed = all credits while a dispute is open/lost, else `credits × refunded ÷ paid` from the provider's *cumulative* `amount_refunded`. Only the difference is applied ⇒ duplicates, related events and out-of-order deliveries converge; refund + dispute on one payment reverse once; a won dispute restores exactly its hold; a closed dispute cannot be reopened by a late event.
18. Engagement-invoice refunds now update the record from the cumulative refund; disputes on non-credit payments notify staff and change nothing automatically. Lead-token refunds are flagged for manual review (LeadOS ledger rules untouched).
19. Packs and rate cards are operator data. `synthetic` rows are for dev/test, labelled in every UI, and refused in production. **Auto-recharge is not implemented**; the wallet flag exists only so "off" is explicit.

## Reliability
20. Pages use `requireOrgPage` (redirect to login / onboarding / `/app/denied?why=scope|role`). Reason: a thrown `LosAuthError` renders as a 500 and production strips its message, so an error boundary cannot do permission logic. `error.tsx` exists for unexpected failures only. 36 OS server actions that called `requireOrg` outside their error wrapper now return a form message.
21. Tick lease is a row (`CosHeartbeat "os.tick.lease"`, 120 s) — advisory locks are per connection and ours are pooled. Units were already individually atomic; the lease stops duplicate sweeps.
22. Scheduler trigger shipped as `.github/workflows/growthos-tick.yml` (free, inert until two secrets exist, best-effort timing). `vercel.json` left daily so a Hobby deploy does not fail. Local: `npm run tick:local`.
23. Assets are private in every adapter. Vercel Blob uses `access: "private"` (SDK 2.8). Providers that must fetch media get a single-version HMAC link valid 30 minutes, served by `/api/os/media/[versionId]`; it needs a public https origin (`MEDIA_PUBLIC_ORIGIN` or production `SITE_URL`), otherwise Instagram/Facebook media honestly says so.
24. **Disposable-database marker**: localhost is not trusted (tunnels). Tests, seeds, wipes and the dev server also require a marker row inside the database. Finding along the way: importing Prisma auto-loads `.env` (live values here), so the marker script reads the local env files directly and ignores `process.env`.

## Honest labels
25. **No research mode.** No retrieval provider is wired, so every text tool is labelled "Source-based drafting". Nothing is looked up, nothing is cited as researched.
26. Scripts, shot lists and carousel copy carry a "what you get / what a person still does" note; video formats still need a finished file from Assets.
27. The dev-only stand-in model (`/api/dev/llm`, flag + non-production) exists solely for local browser walkthroughs; its drafts are prefixed `[TEST DRAFT]`.

## Pricing and profitability (second pass)
28. Prices are still the owner's call, but profitability is now **enforced, not assumed**: a non-synthetic rate card activates only if every tool's worst-case margin (7k prompt tokens, longest output, one retry; cheapest real pack less a 6% fee) is ≥ `AI_MIN_MARGIN_PCT` (default 70), and only when provider prices, a real pack and any needed `AI_FX_<CUR>_PER_USD` are configured — "cannot check" blocks activation. The operator page shows the table and the realised 30-day margin.
29. The proposal (`lib/os/pricing.ts` → `PROPOSED_*`, reasoning in `GROWTHOS_AI_PRICING_PROPOSAL.md`) pre-fills the draft form only. Unit economics are laid out as an illustrative calculation with explicit assumptions and unknowns in `GROWTHOS_AI_PRICING_PROPOSAL.md` §4 — no headline margin is claimed. The activation floor caught an under-priced image tool in the first draft (8 → 10 credits).
30. AI output is stored before settlement (two-phase finish) so a worker crash after the provider answered is recovered by the sweep and charged once; output stays invisible until `completed`.
31. Sales outcomes are recorded by the client (`leads.edit`), never by Catalyst staff — confirmed by the journey test, left as is.
32. Test files run sequentially; correctness over ~25 s of wall time.

## Third pass
33. **Research is real or absent.** One provider (Brave Web Search API) behind `BRAVE_SEARCH_API_KEY`; unset ⇒ no option, label stays "source-based drafting". When switched on for a run: the search happens first; a failed or empty search fails the run (never a silent un-researched draft); the model may use a web fact only with a `[n]` marker; a marker that points at no source, or no marker at all, discards the draft with no charge; the cited sources (title + https link) are appended to the copy so they survive editing and saving. Only the typed topic is sent to the search provider. Priced as its own rate-card line (`research`, flat per search) and included in the margin check.
34. **Included credits** come from an explicit `includedAiCredits` (+ optional `includedAiCreditsExpireDays`) on the proposal — refused without at least one AI tool, shown on the client's proposal card, granted once on signature. The pre-existing tier placeholder `allowances.aiCredits` (200/500/1200) was never priced and is deliberately NOT converted into credits.
35. LinkedIn documents/videos process asynchronously: the adapter waits ~40 s for `AVAILABLE`, otherwise raises a *retryable* failure before any post exists (a retry re-uploads — acceptable for occasional posts; noted in code).

## Final verification pass
36. **Signing is one transaction** (claim + workspace flip + included-credit grant). Engagement acceptance and the checklist follow the commit; they are idempotent and cannot orphan a grant.
37. **More included credits on a revised scope is an explicit tick**, never a default; each grant is keyed to its own contract.
38. **Uploads are remembered per publication** (`providerMedia`), for 20 hours, and forgotten on a terminal failure — a person's reschedule starts clean rather than trusting a stale provider id.
39. **Research checks are snippet-level and deterministic.** A figure not in the cited snippet discards the draft; a vocabulary mismatch flags it; nothing is ever labelled "verified". Retrieved text is untrusted: instruction-like results are dropped, URLs are withheld from the model, and any foreign web address in a researched draft discards it. Pages are not fetched — fetching arbitrary URLs server-side would add an SSRF surface and cost for a modest gain; revisit only with an allow-list or a provider that returns page text.
40. **Citation numbering belongs to the run.** It cannot be edited by hand; the source list is rebuilt from stored sources on save.
41. **A search that ran is a separate usage row**, so a known search price is never lost behind an unknown model price.
42. **No margin is claimed.** The activation floor is a below-model-cost guard; the pricing document shows the calculation, its assumptions, exclusions and unknowns.

## OWNER decisions still needed
- Real rate card and pack prices, currencies and markets. Whether included credits are granted per contract signature or per cycle (today: an operator grant with explicit expiry).
- Which scheduler trigger to run in production (GitHub Actions, Vercel Pro cron, or another) — exactly one.
- Whether staff-assisted client-billed AI will be offered at all (the control exists; default is never).
- A retrieval/search vendor, if a research mode is wanted. Image and video vendors (unchanged from the earlier list).
- Everything still open in `GROWTHOS_DECISIONS.md` (secret rotation, provider approvals).
