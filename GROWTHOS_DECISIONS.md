# GrowthOS upgrade — decisions

Routine choices made during the build, with the reason. Items marked **OWNER** need a decision from the business.
`docs/` is git-ignored (private client documents live there), so blueprint deltas are recorded here instead of `docs/os/blueprint.md`.

## Safety and environment
1. **Local Postgres 18 cluster for dev + test** (`%LOCALAPPDATA%\growthos-devdb`, port 54329, dbs `growthos_dev`, `growthos_test`, trust auth on localhost). `.env.development.local` overrides `DATABASE_URL` for `next dev`; `.env.test.local` holds `TEST_DATABASE_URL`. Neither file is tracked. `.env` / `.env.local` were not edited.
2. **Fail closed, in code**: `lib/dbGuard.ts`. Outside `NODE_ENV=production` the app and every script refuse a non-local database; tests force `DATABASE_URL = TEST_DATABASE_URL`, which must be local and end in `_test`, otherwise an unreachable sentinel is used. There is no override flag.
3. **Live third-party keys are blanked in `.env.development.local`** (Stripe, Resend, Twilio, LLM, Gemini) so local work cannot charge, send or call paid AI by accident. Remove a line to opt in.
4. **No public secret fallback anywhere.** `"dev-secret"` removed from field encryption AND from the admin and partner session signers (an unset secret made sessions forgeable). Missing secret ⇒ nobody can sign in / nothing can be encrypted.
5. **Encryption key versioning**: new ciphertext is `k2.iv.tag.data` under `LEADOS_SECRET` (now required). Legacy 3-part values still decrypt by trying `LEADOS_SECRET` → `LEADOS_LEGACY_SECRET` → `ADMIN_SESSION_SECRET`, so whichever key production actually used keeps working. `scripts/growthos-v2-ops.ts rotate-keys` re-encrypts (dry-run by default). Nothing is re-keyed silently.
6. Browser verification used **local dev sessions inserted into the dev database** rather than typing a password into a login form.

## Data model
7. New tables are `Cos*`, additive, with **real FKs to `LosOrg` and to their parents**. Org FKs cascade: an org is only ever deleted by the demo wipe / test cleanup, never by a product flow. Parent/child org equality is asserted in code on every id that arrives from a form.
8. **Partner and marketing tables are untouched** (repo rule). The partner link is `CosEngagement.partnerDealId` (unique, plain id) — uniqueness is what makes linking idempotent.
9. **States stay documented strings validated in `lib/os/*`** (repo convention; no Prisma enums) — the state machines are unit-tested instead.
10. **Master content = the existing `CosWorkItem type=content`**; channel versions are `CosContentVariant`. The approval engine is reused: `CosApproval.subject = "variant"`.
11. `CosConnection` unique key moved from `(orgId, provider)` to `(orgId, provider, externalAccountId)`. Legacy rows (null account id) are adopted by the first account discovered on reconnect.
12. `CosMetricPoint` is kept for org-level Search Console days; **all new dimensional metrics go to `CosMetricSnapshot`** (`kind` = daily increment | lifetime total). Folding the old table in is staged for later.
13. `CosWorkspace.brandProfile` JSON is kept and still read; the structured `CosBusinessProfile` is what new prompts and screens use.
14. **Payment status is derived** from commercial records, never typed in, and is separate from the delivery stage.

## Product behaviour
15. **"Accepted" can only happen through the client's signature** on a proposed contract. Staff cannot move an engagement there.
16. **Missing access blocks only dependent work.** Going active with open onboarding items needs a written note; dependent items stay blocked through `CosDependency`.
17. An access item that names a provider **cannot be ticked** — it completes itself when that connection verifies. Notes containing "password" are rejected.
18. **Approval invalidation is per variant.** Copy, media, CTA or destination change ⇒ that variant's approval is revoked, its scheduled publication cancelled, state back to QA. A change to the master or the campaign brief only **flags** variants (`sourceChanged`) — approvals stand until someone edits the variant.
19. **Only the client can approve a claim** about their business; brand and source assets likewise.
20. **Publishing**: one publication per variant version (`idempotencyKey`), atomic claim, publish-time revalidation, retry only for 429/503 (max 4 attempts, 2/4/8 min), 5xx / timeouts / dropped connections are **uncertain** and never retried, partial threads keep the ids already posted. A publication stuck in `claimed` for 15 minutes is parked as uncertain for a person.
21. **Manual publication is first-class and labelled**: `adapter = manual` with the live link as evidence; it still requires the approval.
22. **The test adapter** (`provider = "test"`) exists only when `GROWTHOS_TEST_ADAPTER=1` and `NODE_ENV !== production`. Its publications are labelled TEST in the UI and excluded from real clients' content results.
23. **Attribution** is single-touch at capture: `known` only when the tagged link matches THIS org's campaign code or variant id; a form linked to a campaign sets the campaign but not the source; unknown tags are never trusted. Opportunities freeze attribution at creation.
24. **Money never crosses currencies**; sales are grouped per currency. **Missing metrics are absent, not zero.** Reach and averages are never rolled up.
25. **AI**: usage is recorded per call; cost is `null` ("unknown") unless `LLM_PRICE_*` is configured. Variant drafts are checked deterministically for unsupported numbers/superlatives; report narratives containing a number that is not in the supplied facts are discarded in favour of a plain factual summary. Video variants are scripts — never presented as videos.
26. **Handover**: contracts end, engagement → `offboarded`; if no other engagement is open the workspace becomes `read_only` — ended scope stays visible and exportable, nothing can be created, approved, scheduled or published. Nothing is deleted.
27. **Self-service**: registering needs a pending invitation and org creation is off unless `GROWTHOS_SELF_SERVICE=on`. Invitations, public growth audits and public lead-capture forms are unchanged. Existing orgs are untouched.
28. **CRM entitlement** is enforced inside `requireOrg` (any call asking only for `leads.* / campaigns.* / pipeline.*`) and in the API-key path — not per page.
29. Catalogue grew from 12 to **14 services** (`video`, `crm`); website / software / paid-ads milestones were extended to match the required templates. Meta moved from "Coming soon" to connectable-when-configured (brief §H supersedes the 2026-09-18 note).
30. Legacy single-body publish (`publishWorkItem`) now goes through the same adapters, so no outdated LinkedIn endpoint remains.
31. Seeds run through vitest (`npm run seed:growthos-demo`) purely so `@/…` imports resolve without a new dependency.

## OWNER decisions still needed
- **Scheduler**: `/api/os/tick` needs calling every 1–5 minutes (Vercel Pro cron or an external scheduler). `vercel.json` was left daily so a Hobby-plan deploy does not fail.
- **Production asset storage**: adapter written for Vercel Blob (public unguessable URLs, needed by Instagram/Facebook media). Confirm the provider or name another.
- **Rotate the provider secrets** that were pasted into a chat on 2026-09-18, then set `LEADOS_SECRET` (and `LEADOS_LEGACY_SECRET` if production encrypted under `ADMIN_SESSION_SECRET`).
- Price book, tier allowances, review cycles and response times remain per-engagement inputs; nothing was invented.
- Whether LinkedIn company pages, Meta and YouTube upload approvals will be applied for (each needs a provider review).
- Whether a won partner deal should auto-create the workspace (today an admin picks the deal when provisioning).
- Image / video generation vendors. Image generation is wired to any OpenAI-compatible Images endpoint but unverified; video generation was **not** implemented (no verified provider API) — the human production path is complete.
