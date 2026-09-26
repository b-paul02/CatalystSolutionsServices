# GrowthOS — test accounts, fixtures and safe setup

Companion to `GROWTHOS_MANUAL_TEST_GUIDE.md`. Everything here is **synthetic**. No real client, lead, partner or payment data is used anywhere in the pack. No secret values appear in this file: where a value is needed it is either printed by a repository script or typed into the host's settings screen.

## 1. Environments and what belongs where

| Environment | What it is | Run here | Never here |
|---|---|---|---|
| **Local (dev-verify)** — `http://localhost:3100` | `node scripts/dev-verify.mjs`: local disposable Postgres, the dev-only stand-in model (`/api/dev/llm`, drafts prefixed `[TEST DRAFT]`), the `test` publishing adapter, local asset storage, a throwaway operator account, `CRON_SECRET=local-dev-cron-secret`. | All P0 flows, every negative path, every AI Studio tool's mechanics, credits accounting, publishing mechanics, workflows, partner flows, cross-tenant checks. | Anything that needs a real provider. |
| **Local + configuration** — `npm run dev` on `http://localhost:3000` | Same database, but `.env.development.local` decides which real keys exist (they are blanked by default). Add a capped LLM key, Stripe **test** keys with `stripe listen`, a Resend key for a test domain, etc. one at a time. | Real-model usefulness checks, Stripe test-mode round trips via the CLI forwarder, real email to a controlled mailbox. | Live keys of any kind. |
| **Staging** | A second deployment with its own database, secrets and test-mode providers (`GROWTHOS_STAGING_SETUP.md`). Production build, so dev shortcuts are off by design. | The 12 external checks in `GROWTHOS_EXTERNAL_CHECKS.md`, provider publishing on Catalyst-owned test accounts, Stripe test purchases/refunds/disputes, scheduler trigger soak. | Synthetic rate cards/packs, `GROWTHOS_TEST_ADAPTER`, `GROWTHOS_DEV_LLM`. |
| **Production** | The live app. | Read-only checks only: `/api/os/tick` without a bearer answers 401; `/api/dev/llm/...` answers 404; `/admin/os` scheduler banner is neutral. | Any write, purchase, publish, send, seed, wipe or schema push. |

## 2. Confirming the database is safe (without exposing credentials)

The app fails closed outside production: it needs **two** independent proofs before tests, seeds, wipes or the dev server will touch a database (`lib/dbGuard.ts`):

1. The `DATABASE_URL` host is `localhost` / `127.0.0.1` / `::1`.
2. The database itself carries a marker row (`CosHeartbeat` key `db.disposable` whose note equals the database's own name), planted only by `node scripts/mark-disposable-db.mjs <dbname>`.

How you confirm it, safely:

- Run `npx vitest run tests/os/v2-rules.test.ts` — it includes the guard's own tests.
- Rename `.env.test.local` temporarily and run any DB suite — it must report the blocked database and fail to connect. Restore the file.
- Start `node scripts/dev-verify.mjs` — `instrumentation.ts` exits the process before serving a single request if the marker is missing.
- Open `.env.development.local` in an editor and read the host and database name of `DATABASE_URL` with your eyes. Do not paste it into a ticket, chat or screenshot.

`.env` in the repo root holds **live** values and Prisma auto-loads it. Never run a bare `npx prisma db push` — use `node scripts/local-db-push.mjs`, which passes the local URL explicitly and refuses anything that is not `localhost:54329/growthos_dev|growthos_test`.

## 3. Seeded data (after `npm run seed:growthos-demo`)

All rows are `demo: true`. The seed first deletes earlier demo orgs whose name ends in `(demo)`, so it is safe to re-run.

### 3.1 Accounts (seed)

| Email | Display name | Role in Brightside | Role in Northwind | Password |
|---|---|---|---|---|
| `owner@growthos-demo.example.com` | Asha Owner (demo) | `owner` | `owner` | Printed on the last line of the seed output. It is a fixed synthetic value defined as a constant in `scripts/seed-growthos-demo.seed.ts`. |
| `lead@growthos-demo.example.com` | Dev Account Lead (demo) | `cgo_lead` | `cgo_lead` | same |
| `specialist@growthos-demo.example.com` | Mira Specialist (demo) | `cgo_specialist` | `cgo_specialist` | same |

Sign in at `http://localhost:3100/app/login`. Emails are pre-verified; MFA is off.

### 3.2 Workspace A — Brightside Dental (demo)

| Item | State |
|---|---|
| Workspace | industry Healthcare, market IN, timezone `Asia/Kolkata`, currency INR, kind `client` (signed) |
| Engagement | "2026 patient growth engagement", stage **active**, hold none, readiness assets_ready, monthly billing ₹75,000, setup ₹50,000, 2 review cycles, 24 h response, renewal in 45 days (manual). Kickoff summary stored. |
| Contract | **active**, services `social, content, crm, analytics`, modules `content, crm, intelligence` (+ automations), **AI tools = every tool except `blog_article` and `image`** (deliberately unentitled for negative tests) |
| Onboarding checklist | `discovery_profile`, `brand_assets`, `approved_claims` available; the rest pending (e.g. social accounts, blog access) |
| AI credits | rate card **SYNTHETIC** (image 15; others 2 + 10/1k tokens); pack **SYNTHETIC demo pack** 100 credits ₹499; wallet: one `included` grant of **60 credits expiring in 60 days** |
| Goal | "Booked consultations" 40/month, current 14 (measured), agreed by the owner |
| Claims / sources | source "Clinic fact sheet 2026"; claim "1200 patients treated since 2015" **approved**; claim "Most consults are booked within the same week" **proposed** |
| Campaign | "Consult First" **active**, channels x, linkedin, instagram, youtube, blog, CTA "Book a consult", destination `https://example.com/book` |
| Project | social template "Social content programme" with milestones |
| Connection | provider `test` "Test account (always succeeds)", verified, capabilities publish + analytics |
| Master + variants | master "Why the first visit is just a conversation": x/post **published** (test adapter, metrics synced: impressions 1200, link_clicks 48); linkedin/post **client_review**; x/thread **rejected** ("remove prices from social") with one internal + one client comment; youtube/short **draft** (script only); blog/article **draft** |
| Manual metric | GA4 sessions daily 64 (yesterday), campaign-scoped, grade B |
| Lead-capture form | LosCampaign "Book a consult (demo form)" **active**, linked to the campaign |
| Leads | Ravi and Neha (attributed to the published X post via UTM), Imran (no UTM → unknown) |
| Opportunities | Ravi → **won** ₹85,000 today; Neha → **qualified** ₹120,000 |
| Recurring cycle | this month's cycle generated (recurring items + recurring fee record) |
| Scope change | "Google Ads pilot for implants" (paid-ads, ₹30,000) — **approval requested, waiting for the owner** |
| Commercial | setup record ₹50,000 invoiced `DEMO-INV-001`, payment recorded `DEMO-NEFT-7781` |

### 3.3 Workspace B — Northwind Robotics (demo)

| Item | State |
|---|---|
| Workspace | B2B manufacturing, market IN, timezone `Europe/Berlin`; engagement currency EUR |
| Engagement | "New website and product portal", `partnerDealId: demo-partner-deal-001`, stage **active**, hold **awaiting_client** ("We need DNS access and the legal pages…"), readiness foundation_needed |
| Contract | active, services `website, software, branding`, modules `projects`, **aiTools empty** (no AI entitlement) |
| Projects | website template with milestone `discovery` delivered + client-approved and `sitemap` in **client_review**; software template project |
| Everything else | no connections, campaigns, leads, credits or commercial records |

### 3.4 Not seeded (you create these during the run)

| Account / data | How to create | Used by |
|---|---|---|
| Restricted client member `analyst-a@growthos-test.example.com` (role `analyst`) | AUTH-05: owner invites from Settings → Team; accept the invite link printed in the dev server console | permission negatives everywhere |
| Sales rep `rep-1@growthos-test.example.com` | LEAD-03 (invite as `sales_rep`) | CRM |
| Freelancer `free-1@growthos-test.example.com` (`cgo_freelancer`) | ENG-05 (operator → `/admin/os/<org>` → Add staff) | assignment scoping |
| Workspace C "Testcase Clinic (demo)" with owner `owner-c@growthos-test.example.com` | OPS-02 (operator provisioning, tick "Demo workspace") | proposal→signature journey, empty states, isolation |
| Second engagement in Brightside | ENG-10 | multi-engagement, per-engagement handover |
| Partners `partner-test@` and `partner-two@growthos-test.example.com` | ENTRY-08 → PTR-01 → PTR-02 (admin approval prints a one-time password) | partner journey |
| Price book | `npm run seed:price-book` | partner quotes |
| B2C/B2B inventory datasets | OPS-08 (operator upload + compliance approval) | Discover, deliveries |
| Lead tokens | CRD-11 (operator grant at `/admin/leados/tokens`) | reveals, allocations |
| Operator account | defined by `scripts/dev-verify.mjs` as the `ADMIN_ACCOUNTS` entry; sign in at `/admin/login` | all operator tests |
| Signed-out / revoked user | any account after AUTH-09 revocation or AUTH-13 removal | access negatives |

### 3.5 Data states and where they come from

| Required state | Source |
|---|---|
| No active engagement | Workspace C right after OPS-02 (stage prospect, no contract) |
| Proposed but unsigned scope | SCOPE-01 (workspace C) or an operator add-on proposal on Brightside (SCOPE-04) |
| Active scope with AI entitlement | Brightside (seed) |
| Active scope without AI entitlement | Northwind (seed) |
| Paused engagement | ENG-08 / SET-10 (hold paused) |
| Handed-over engagement | SET-11 (workspace C) |
| Sufficient credits | Brightside 60 (+ OPS-05 grant) |
| Insufficient credits | Workspace C after spending its 40 included, or a negative operator adjustment |
| Held credits | a run in progress / an uncertain run (AIX-07) |
| Expired credits | CRD-03 |
| Connected provider | test account (seed); WordPress test site (PUB-02); staging OAuth (SET-04) |
| Disconnected / expired provider | CAL-02 (disconnect), PUB-26 (expired token, staging) |
| Empty dashboards | Workspace C |
| Populated dashboards | Brightside |
| Approved / rejected / revised / scheduled content | seed (approved+published x/post, rejected thread), CONT-04/05/06, CAL-01 |

## 4. Resetting

- `npx tsx scripts/wipe-leados-demo.ts` (or `node --experimental-strip-types scripts/wipe-leados-demo.ts`) removes every `demo: true` row across LeadOS and GrowthOS tables, then `npm run seed:growthos-demo` recreates the two workspaces. Both refuse an unmarked database.
- Rows you created **without** the demo flag (analyst/rep/partner users, non-demo workspaces, price book, global suppressions) survive a wipe. Prefer ticking "Demo workspace (wipeable)" when provisioning. If you must remove the rest, do it in the local DB only.
- The seed does not touch `.env*`, keys or hosted services.

## 5. Services: fixtures vs real accounts

| Service | Local fixture | Real test account needed for |
|---|---|---|
| Text model | stand-in `/api/dev/llm` (`FORCE_PROVIDER_ERROR` in the topic forces a failure) | check 1: usefulness of every prompt, timeout behaviour |
| Image model | none (tool shows "requires setup") | check 2 |
| Web search | none (research option hidden) | check 3 (Brave plan; confirm terms) |
| Asset storage | local disk | check 4 (Vercel Blob, signed links from another network) |
| Stripe | signed fixtures in `tests/os/completion-credits.test.ts`; `stripe listen` forwarder with **test** keys for local browser runs | check 5 (purchase with tab closed, replay, refunds, disputes) |
| Scheduler | `npm run tick:local` | check 6 (one trigger, soak for an hour) |
| Email | console-logged `[leados mail:dev]` lines with dev links | check 7 (Resend to a Catalyst-owned mailbox) |
| X / LinkedIn / Meta / YouTube / GA4 / GSC | `test` adapter (modes ok / retryable_once / uncertain / definite / partial) + contract fixtures | checks 8–12 on Catalyst-owned test accounts with written authorisation; public unless the account is private |
| WordPress | none | any https test site with an application password |
| Twilio | `dev_logged` transport; STOP handling needs a signed webhook | provider sandbox |

## 6. Where evidence goes

Create `growthos-manual-evidence/<YYYY-MM-DD>/` (git-ignored like the other evidence folders; add it to `.gitignore` if you commit) with:

- `screens/<TEST-ID>-<n>.png` — screenshots
- `logs/<TEST-ID>.txt` — console/curl/vitest output with tokens and connection strings redacted
- `tracker.csv` — a copy of `GROWTHOS_TEST_RUN_TRACKER.csv` with results filled in
- `defects.md` — one entry per defect using the template in the guide

Never store screenshots that show a real key, a reset/invite token, or the seed password in a shared location.

## 7. Test-account matrix (roles that exist)

| Persona in the brief | Account | Role(s) | Where |
|---|---|---|---|
| Visitor | none (signed-out browser / private window) | — | marketing site, public forms, partner application |
| Invited client owner | `owner-c@growthos-test.example.com` | `owner` of workspace C | proposal, signature, onboarding, handover |
| Client owner with data | `owner@growthos-demo.example.com` | `owner` of A and B | most client tests |
| Restricted client member | `analyst-a@growthos-test.example.com` | `analyst` in A (temporarily `campaign_manager` / `admin` in AUTH-13, ENG-14) | permission negatives |
| Sales rep | `rep-1@growthos-test.example.com` | `sales_rep` in A | CRM |
| Second client workspace | Northwind (seed) and workspace C | — | isolation |
| Catalyst delivery staff | `lead@…` (`cgo_lead`), `specialist@…` (`cgo_specialist`), `free-1@…` (`cgo_freelancer`) | staff in A and B | delivery, QA, publishing, AI internal |
| Operator / administrator | dev-verify operator (`super_admin` via env cookie); optional DB-set `platformRole` users for support/compliance/inventory/campaign/auditor | `/admin/**` | provisioning, credits, lead supply, reviews |
| Strategic sales partner | `partner-test@…`, `partner-two@…` | `partner` | `/partner/**` |
| Finance / deal desk | the same env-admin cookie maps to admin on the partner surfaces; `finance`/`deal_desk` users need DB-set roles | `/admin/partners/**` | commissions, custom prices |
| Signed-out / revoked | any of the above after sign-out, session revocation (AUTH-09) or membership removal (AUTH-13, SET-08) | — | access negatives |

Roles that exist in code but have no seeded user: `cgo_reviewer`, `sales_manager`, `admin` (client), platform `compliance_admin`, `inventory_admin`, `campaign_admin`, `support_admin`, `auditor`, partner-side `deal_desk`, `finance`. Create them only when a test needs them (the test says how).
