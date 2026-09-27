# GrowthOS completion — handoff (2026-09-21)

> **Newest first: `GROWTHOS_RELEASE_CANDIDATE_REPORT.md`** (release pass: brief→campaign, LeadOS denials, Facebook video, low-balance email, AI timeout handling, journeys from a real login, staging + external-check procedures; 51 files / 578 tests; four verdicts). Then:
> **Read `GROWTHOS_FINAL_VERIFICATION.md` first.** It is the final pre-deployment check: exact build/test results, the ten defects fixed during it, per-requirement confirmation, the research and media findings, every external blocker with its owner action and smallest verification, and the three verdicts. Logs: `growthos-final-evidence/`. Final numbers: typecheck exit 0 · 49 files / 555 tests · production build exit 0.

Branch `growthos-v2`, **nothing committed** (the owner has not asked for a commit). No deploy, no production migration, no live charge, publish or message happened. Companion files: `GROWTHOS_COMPLETION_PLAN / PROGRESS / DECISIONS / REQUIREMENTS.csv / VERIFICATION`, schema note `prisma/changes/2026-09-growthos-ai-credits.md`.

## 1. What was completed
- **Client AI Studio** (`/app/studio`): 17 tools, dedicated `ai.use` permission, tool entitlement per contract, server quote → reserve → queued/running → completed/failed/uncertain, persisted drafts, edit-and-save into campaign / master / channel variant (images into Assets), honest "source-based drafting" and "a script is not a video" labels.
- **AI-credit domain** (`lib/os/credits.ts`): org wallet, integer credits, append-only ledger, purchased/included/promotional/adjustment grants with provenance and expiry, reservations, versioned rate cards, quotes, member monthly caps, deficit state, invariant checker.
- **Payer model**: initiator, client org, purpose, payer and client authorisation recorded separately; all Catalyst production AI is `catalyst_internal`; staff-assisted client billing only under a client-granted, capped, revocable authorisation.
- **Credit purchases** (`lib/os/creditPurchase.ts`): operator packs, server-priced tenant-linked orders, Stripe checkout from server data, grant only from a verified matching webhook, refunds/disputes reconciled idempotently. Invoice refunds/disputes on the engagement side handled too.
- **Client credit UX** (`/app/settings/ai-credits`) and **operator console** (`/admin/os/credits`).
- **Analytics adapters**: LinkedIn organisation posts, Facebook Page posts, Instagram media. **X media upload** (images/video).

## 2. Defects repaired
| Audit item | Fix |
|---|---|
| H-3 / M-5 permission + scope refusals rendered HTTP 500 | `requireOrgPage` redirects (login / onboarding / `/app/denied`), 25 pages + `requireModule`; `error.tsx` for unexpected errors only. **New finding:** 36 OS server actions threw on a denied permission — now return a form message |
| H-5 no internal-vs-client distinction | `CosAiUsage.payer / billingPurpose / operationId`; defaults make history internal |
| M-1 nothing schedules the tick | lease + sweeps in `lib/os/tick.ts`; trigger workflow + local scheduler; dead/stuck jobs on `/admin/os`. **Still not active until configured (§7)** |
| M-2 storage dependency missing | `@vercel/blob` 2.8 installed; adapter rewritten to **private** access; signed 30-minute media links for provider ingestion |
| M-4 no refund/dispute handling | credits: full; invoices: refund follows cumulative total, disputes notify |
| H-4 tests bypass entry points | `tests/os/entry-harness.ts` + 3 new suites |
| Safety (brief §5) | disposable-DB **marker** required by tests, seeds, wipes, dev server |

## 3. AI-credit accounting and configuration guide
**Units.** 1 credit is an integer. Price of a run = `base + ceil(outputTokens ÷ 1000 × perKOutputTokens)` from the active rate card. The **quote** uses the chosen output ceiling (short/standard/long) — that maximum is reserved. The **charge** uses the provider's reported output tokens, never above the quote. Images: `base` only.
**Set up (operator, `/admin/os/credits`):**
1. *New rate card* → JSON keyed by tool (`campaign_brief, content_calendar, blog_outline, blog_article, web_copy, linkedin_post, linkedin_carousel, x_post, x_thread, social_caption, youtube_script, short_script, email_sequence, seo_brief, repurpose, image, performance_summary`). Remove tools you do not want to sell: unpriced = unavailable. Save draft → review → **Activate**. Cards are never edited; activating retires the previous one; issued quotes keep their version.
2. *New pack* → label, credits, ISO currency, price in **minor units**, market. Packs are immutable: retire and add to change a price.
3. *Grant or adjust* → included / promotional (expiry date or an explicit "does not expire") or a signed adjustment. Reason is mandatory and visible to the client. Purchased credits come only from verified payments.
4. Tool entitlement → tick tools on the contract proposal (`/admin/os/<org>`); the client signs it like any scope.
5. Optional provider cost visibility: `LLM_PRICE_INPUT_MICROS_PER_MTOK`, `LLM_PRICE_OUTPUT_MICROS_PER_MTOK`. Unset ⇒ "unknown", never 0.
**Client side:** billing admins buy, set a low-balance notice, authorise staff use; `team.manage` sets member caps.
**Policies:** failure without output ⇒ no charge; partial valid output ⇒ charged on actual; regeneration ⇒ new quote; uncertain ⇒ held until an operator closes it without charge; refund/dispute after use ⇒ deficit, AI paused, next grant pays it, nothing auto-charged; auto-recharge does not exist.
**Synthetic data:** the demo seed creates a rate card and pack flagged `synthetic` (2 + 10/1k tokens; 100 credits ₹499). They are test values, labelled in every UI, refused in production — **not a price proposal**.

## 4. Platform capability matrix
Legend: **I/T** implemented + contract-tested (fixtures) · **I/U** implemented, unverified · **M** missing · **PR** provider-restricted · **EB** externally blocked (needs credentials/approval) · **MF** manual fallback available. *No cell is live-verified.*

| Platform · format | Publish | Media | Analytics | Notes |
|---|---|---|---|---|
| YouTube long-form | I/T · EB | finished file from Assets (human) | I/T · EB | API audit needed or uploads stay private; MF |
| YouTube Shorts | I/T · EB | same | I/T · EB | same API; MF |
| X text | I/T · EB | — | I/T · EB | paid API tier; MF |
| X thread | I/T · EB (resumable, partial ids kept) | **I/T (third pass)**: media rides on the first post, never re-uploaded on resume | first post only | |
| X image / video | **I/T** · EB | chunked upload v2; the media id survives a refused post and is reused on retry | via post metrics | needs `media.write`; MF |
| LinkedIn personal text / image | I/T · EB | single image I/T | **PR** (`r_member_social` restricted) → manual entry | |
| LinkedIn company text / image | I/T · EB | single image I/T | **I/T (new)** · EB | Community Management API approval + page ADMINISTRATOR |
| LinkedIn multi-image (2–20), document (PDF/PPTX/DOCX ≤100 MB), video (MP4 75 KB–500 MB) | **I/T** · EB | Images / Documents / Videos API, uploaded before the post; waits for AVAILABLE | company posts as above | still-processing ⇒ retried later with the **original upload id** (never re-uploaded), nothing posted meanwhile; MF |
| LinkedIn "carousel" | the **document** format above publishes a file **a person designed and uploaded**. The Studio *carousel copy* tool writes slide copy + caption only — it does not produce a document | | | |
| Facebook Page **video** | **M** → MF | — | — | not implemented; found missing from this matrix during final verification |
| Facebook Page post | I/T · EB | photo via signed link I/T | **I/T (new)** · EB | App Review; needs public https origin for media |
| Instagram post / carousel / Reel | I/T · EB | via signed link I/T | **I/T (new)** · EB | professional account; 100 API posts/24 h |
| Instagram Stories | M → MF | — | — | not requested by the brief |
| WordPress article + featured image | I/T · EB (per-site app password) | I/T | n/a (site reporting = GA4) | MF |
| GA4 / Search Console | n/a | n/a | I/T · EB | sessions and search clicks are separate metrics, never merged |

Metric definitions, source, account, period and freshness are unchanged from v2 (`lib/os/metrics.ts`): daily rows add up, lifetime rows take the latest, missing is absent, reach is never summed, money per currency. New adapters return **lifetime** rows only.

## 5. Demo instructions (local)
```
pg_ctl -D "$env:LOCALAPPDATA\growthos-devdb" -o "-p 54329" start
node scripts/mark-disposable-db.mjs growthos_dev growthos_test      # once
npm run seed:growthos-demo
node scripts/dev-verify.mjs          # http://localhost:3100, dev-only stand-in model; or `npm run dev` with real LLM_* keys
npm run tick:local                   # optional: local scheduler
```
Client: sign in as `owner@growthos-demo.example.com` (password printed by the seed) → Brightside Dental → **AI Studio** → LinkedIn post → Get quote → Run → edit → Save as LinkedIn version in "Consult First" → Content shows the draft awaiting QA → **Settings → AI credits** for balance, usage, transactions. Try *Article draft* (unentitled) and switch to Northwind Robotics then open `/app/leads` (scope screen).
Staff: `lead@…` → AI Studio shows "Who pays" (Catalyst by default). Operator: `/admin` sign-in with a local `ADMIN_ACCOUNTS` entry → GrowthOS → *AI credits*. `node scripts/dev-sessions.mjs` mints throwaway sessions for tooling-driven checks.

## 6. Migration and compatibility
See `prisma/changes/2026-09-growthos-ai-credits.md`. Additive only; historical usage defaults to Catalyst-paid; contracts grant no tools until edited; new env: `MEDIA_PUBLIC_ORIGIN` (optional), `NEXT_DIST_DIR` (build tooling only), `GROWTHOS_DEV_LLM` (dev only). New dependency: `@vercel/blob`.

## 7. External setup still required (exact)
| Task | Where | Docs |
|---|---|---|
| **Scheduler trigger** — choose ONE: (a) GitHub repo secrets `GROWTHOS_TICK_URL` = `https://app.<domain>/api/os/tick`, `CRON_SECRET`; (b) Vercel Pro: add `{ "path": "/api/os/tick", "schedule": "*/5 * * * *" }` to `vercel.json` (Vercel sends the `CRON_SECRET` bearer itself); (c) any scheduler sending `Authorization: Bearer $CRON_SECRET`. Until one exists **nothing is scheduled**; `/admin/os` shows a red banner | GitHub / Vercel | https://docs.github.com/actions/using-workflows/events-that-trigger-workflows#schedule · https://vercel.com/docs/cron-jobs |
| Stripe: add webhook events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`; verify with **test-mode** keys first | Stripe dashboard | https://docs.stripe.com/webhooks · https://docs.stripe.com/disputes |
| Vercel Blob store + `BLOB_READ_WRITE_TOKEN`, `ASSET_STORAGE=vercel_blob`; confirm private-store availability on the plan | Vercel | https://vercel.com/docs/vercel-blob |
| `MEDIA_PUBLIC_ORIGIN` / `SITE_URL` = public https origin (Meta media ingestion) | env | https://developers.facebook.com/docs/instagram-platform/content-publishing |
| LinkedIn Community Management API (`rw_organization_admin`, `w_organization_social`) | LinkedIn developer portal | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/share-statistics |
| Meta App Review: `pages_read_engagement`, `instagram_manage_insights` (+ existing publish scopes) | Meta | https://developers.facebook.com/docs/graph-api/reference/insights · https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights |
| X: tier with post + media endpoints; add `media.write` to `X` scopes | X developer portal | https://docs.x.com/x-api/media/quickstart/media-upload-chunked |
| LLM + image providers, real rate card, real packs | env + `/admin/os/credits` | — |
| Web research (optional): Brave Search API key; check the plan's terms for AI use | `BRAVE_SEARCH_API_KEY`, `RESEARCH_PRICE_MICROS`, rate-card key `research` | https://api-dashboard.search.brave.com/app/documentation/web-search/get-started |
| LinkedIn media: same Community Management approval; documents and videos need `w_organization_social` / `w_member_social` | LinkedIn developer portal | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/documents-api · …/multiimage-post-api · …/videos-api |
| Everything in `GROWTHOS_EXTERNAL_SETUP.md` (unchanged) | | |

## 8. Known limitations / unfinished work (precise) — updated after the second pass
Closed in the second pass: entry-point tests for acceptance steps 3, 11–13, 15–16 (`completion-journey`); operator actions, `proposeContract` tools and invoice refunds (`completion-operator`); a crashed-after-response AI run is now **recovered and charged once** instead of only released; 49 legacy LeadOS actions now return a message / land on the role screen when refused; per-run **source picker**; skip-to-content link; **pricing proposal + enforced margin floor** (`GROWTHOS_AI_PRICING_PROPOSAL.md`). New defect found and fixed: there was **no UI entry point to send a scope change to the client for approval** (only the library call the seed used) — added `requestChangeApproval` + a button on the work item.
Closed in the third pass: LinkedIn multi-image / document / video and X thread media; a **real research mode** (web search + validated citations, off until a search key exists, separately priced); **included credits** as an explicit, client-visible number granted once on signature; interactive browser walk of profile, claims, approvals, results, assets.
Still open:
1. **Nothing is live-verified**: no real LLM, image, Stripe, Blob or social call has run. Studio prompts have only met a stand-in model.
2. Research mode grounds on **search snippets only** (pages are not read) and its validator is not a fact-check (see FINAL_VERIFICATION §5). It is built against the Brave Web Search API but has never met the real service; confirm the plan permits use with an AI model, then set `BRAVE_SEARCH_API_KEY` + `RESEARCH_PRICE_MICROS`. No video generation.
3. Instagram Stories: not built and not in the brief (manual publication path).
4. An AI run that died **before** the provider answered is `uncertain` and can only be closed without charge (correct: there is no output).
5. Included credits are granted once per signed scope (explicit number on the proposal). Per-cycle top-ups are still an operator grant.
6. Five LeadOS actions that return data (B2B search / reveal, lead export string, campaign checks) still throw on a refused call; their callers are client components that already handle a failed request.
7. Low-balance and uncertain notices are in-app only. Credit ledger/orders/runs are in the JSON export; no CSV view.
8. Browser: all main client, staff and operator pages were loaded (HTTP 200, no error screens) and the new surfaces walked; keyboard order, visible focus and the skip link were checked on the Studio form. **Not done:** a screen-reader pass, interactive walk of every older form, saved screenshots (tooling returns images inline only).
9. Owner items: accept / adjust the pricing proposal, tax treatment, scheduler choice, provider approvals, secret rotation, rich-text editor.

## 9. Production rollout checklist (not executed)
1. Rotate secrets noted in `GROWTHOS_DECISIONS.md`; set `LEADOS_SECRET`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`, `STRIPE_*`.
2. Neon restore point. 3. v2 rollout note, then the AI-credit note (`prisma db push`, additive, expect no warning). 4. Deploy.
5. Stripe **test mode**: one pack purchase, close the tab before redirect → credits appear once; refund it → credits reverse once. Record the date. Only then switch keys.
6. Activate a real rate card; publish real packs; add `aiTools` to contracts via signed scope changes.
7. Configure exactly one scheduler trigger; confirm the `/admin/os` banner turns neutral and stays so for a day.
8. Blob store + one upload/download; one Instagram test publish through a signed media link.
9. Live-verify providers one at a time (publish + metric sync), recording dates in `GROWTHOS_VERIFICATION.md`.
**Rollback:** redeploy the previous build (schema additions are inert to old code). Retire packs to stop sales instantly; with no active rate card no client run can start; the kill switch still stops publishing. Never delete ledger rows.

## 10. Assessment
| Question | Answer |
|---|---|
| Complete against the brief? | **No** — see `GROWTHOS_FINAL_VERIFICATION.md` §10 (missing: Facebook video, video generation, email notices, campaign-record save; plus verification gaps). The AI Studio, credit economy, payer model, purchase lifecycle, reliability fixes, storage, scheduler wiring and missing adapters are built and locally verified. Not complete: research mode, several media formats, full entry-point coverage of the older journey steps, accessibility passes, and every live integration (see §8). |
| Internal demo | **Ready** — local, stand-in model or a real key, synthetic prices labelled. |
| Controlled pilot | **Not ready, short list**: scheduler trigger, a real model key exercised against the Studio prompts, private asset storage; plus accepted prices and a Stripe test-mode round trip only if credits are sold in the pilot. Keep research and direct publishing off until their blocker row is done. |
| Production | **Not ready**: no external integration has ever been contacted; nothing is scheduled; commercial/tax decisions open; no screen-reader verification; a few brief items unimplemented. |
