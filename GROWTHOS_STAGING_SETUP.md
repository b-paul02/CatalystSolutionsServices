# GrowthOS — staging setup (prepared, NOT performed) · 2026-09-21

Nothing here was provisioned, bought, deployed or pushed. It is the procedure for a person with the accounts. Variable **names** only — values are typed into the host's settings screen, never into a file in this repo, a chat or a ticket.

## 0. What "staging" is
A second deployment of this branch with its **own database, its own secrets and test-mode providers**. It runs the production build (`NODE_ENV=production`), so three development conveniences are **off by design** and must stay off:
| Convenience | In a deployed staging | Consequence |
|---|---|---|
| `test` publishing adapter (`GROWTHOS_TEST_ADAPTER`) | ignored when `NODE_ENV=production` | synthetic *adapter* runs stay on a developer machine (`npm run tick:local`); staging publishes only to real test accounts Catalyst owns (GROWTHOS_EXTERNAL_CHECKS.md) |
| stand-in model (`GROWTHOS_DEV_LLM`, `/api/dev/llm`) | 404 in production (tested) | staging needs a real model key |
| synthetic rate cards / packs | refused in production (tested) | staging needs a real rate card that passes the price-floor check; use the accepted prices, Stripe in **test mode** |
| local operator cookie (`scripts/dev-sessions.mjs`) | refused in production (tested) | operators sign in with `ADMIN_ACCOUNTS` credentials created for staging |
Never set `ASSET_STORAGE_ALLOW_LOCAL`, never run `scripts/mark-disposable-db.mjs` against a hosted database, never point staging at the production `DATABASE_URL`.

## 1. Separate non-production database
1. Create a **new** Postgres database/branch for staging (on Neon: a separate *project* or a branch that is never promoted). Owner action; may cost money depending on plan — check before creating.
2. Put its URL in the staging environment's `DATABASE_URL` only. Production's URL must not appear in staging, and the reverse.
3. Apply the schema with §6. Do **not** copy production data into staging.

## 2. Synthetic client data
- Operator path (works in a production build): sign in at `/admin` → `/admin/os` → create a workspace → propose a scope with services, `aiTools` and included AI credits → sign in as the invited client owner and sign it. That exercises the real grant.
- The demo seed (`npm run seed:growthos-demo`) refuses any database without the disposable marker. It is a local tool; do not weaken it for staging.
- Use `@example.com`-style addresses for every synthetic person. No real client, lead or contact data.

## 3. Environment variables (names → where)
All in the host's per-environment settings (Vercel: Project → Settings → Environment Variables → *Preview/Staging* scope; never "Production" scope for staging values).
| Group | Names | Staging value policy |
|---|---|---|
| Core | `DATABASE_URL`, `LEADOS_SECRET`, `ADMIN_SESSION_SECRET`, `ADMIN_ACCOUNTS`, `CRON_SECRET`, `SITE_URL`, `LEADOS_APP_URL` | new random secrets, different from production |
| Email | `RESEND_API_KEY`, `EMAIL_FROM` | a Resend key restricted to a test domain, or leave unset (mail is then logged, not sent) |
| Private assets | `ASSET_STORAGE` = `vercel_blob`, `BLOB_READ_WRITE_TOKEN`, `MEDIA_PUBLIC_ORIGIN` | a **separate** Blob store for staging |
| Text model | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_PRICE_INPUT_MICROS_PER_MTOK`, `LLM_PRICE_OUTPUT_MICROS_PER_MTOK` | a key with a low spend cap |
| Image model | `IMAGE_API_BASE_URL`, `IMAGE_API_KEY`, `IMAGE_MODEL`, `IMAGE_PRICE_MICROS` | optional; unset = the image tool says "not set up" |
| Pricing | `AI_MIN_MARGIN_PCT`, `AI_FX_INR_PER_USD` | owner decision |
| Payments (test mode) | `STRIPE_SECRET_KEY` (an `sk_test_…` key), `STRIPE_WEBHOOK_SECRET` (of the staging endpoint) | **test mode only**; a live key must never be in staging |
| Deliberately UNSET in staging until its check passes | `BRAVE_SEARCH_API_KEY`, `RESEARCH_PRICE_MICROS`, `LINKEDIN_CLIENT_ID/SECRET`, `X_CLIENT_ID/SECRET`, `META_APP_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET` | unset ⇒ research is not offered, and each channel shows "setup required" and falls back to *manual publication with a link as evidence* |
| Must NOT be set | `GROWTHOS_TEST_ADAPTER`, `GROWTHOS_DEV_LLM`, `ASSET_STORAGE_ALLOW_LOCAL`, `TEST_DATABASE_URL` | — |

## 4. Scheduler
**Documented choice (decision 22):** `.github/workflows/growthos-tick.yml`, inert until two repository secrets exist. **Recommended configuration:**
- *Staging:* the GitHub workflow. Create a GitHub **environment** or a second copy of the two secrets pointing at staging: `GROWTHOS_TICK_URL` = `https://<staging-host>/api/os/tick`, `CRON_SECRET` = staging's value. Free; timing is best-effort (runs can start minutes late).
- *Production:* **one** trigger. Recommendation: Vercel cron `*/5 * * * *` on `/api/os/tick` if the project is on a plan that allows it (predictable timing, same platform); otherwise the GitHub workflow. **Activation is an owner decision and is not made here** — `vercel.json` still lists only the two daily jobs so a Hobby deploy cannot fail.
- *Health check (safe in production):* `/admin/os` shows "Scheduler: last run …", turns red after 15 minutes, and lists dead / stuck jobs. `GET /api/os/tick` without the bearer must answer 401. Neither publishes anything. Synthetic publication tests are **not** run in production.

## 5. Capabilities that stay off until verified
Research, LinkedIn, X, Meta (Facebook + Instagram), YouTube, GA4, Search Console: leave their variables unset. Credit purchases: closed until a real rate card + a real pack + Stripe keys exist (the page says so). Enable each only after its procedure in `GROWTHOS_EXTERNAL_CHECKS.md` passes on staging.

## 6. Database rollout review
**Pending, in order:** (1) `prisma/changes/2026-09-growthos-v2.md`, (2) `prisma/changes/2026-09-growthos-ai-credits.md`. Production has neither. Exact content of (2): 12 new tables, 11 new nullable/defaulted columns (`CosAiUsage` ×3, `CosContract.aiTools`, `CosPaymentEvent` ×2, `CosPublication.providerMedia`, `CosCreditWallet` ×3, `CosAiAttempt.providerRequestId`), 2 indexes. Nothing renamed, dropped or retyped; no `Los*`/marketing/partner table touched.

**The one non-additive item** is in (1): `CosConnection` unique `(orgId, provider)` → unique `(orgId, provider, externalAccountId)`. `prisma db push` reports it as a *data-loss warning* because a unique index is dropped. **Do not pass `--accept-data-loss` to get past it.** Do the swap as explicit, reviewed SQL so that the push that follows has nothing to warn about:
```sql
-- pre-check: must return 0 rows (two connections for the same account would break the new index)
SELECT "orgId","provider","externalAccountId",count(*) FROM "CosConnection" WHERE "externalAccountId" IS NOT NULL GROUP BY 1,2,3 HAVING count(*)>1;
```
then create the new unique index, create the plain `(orgId, provider)` index, and only then drop the old unique index — names taken from the generated diff below, not typed from memory.

**Other pre-checks on existing tables** (new tables are empty, so their unique indexes cannot collide):
```sql
SELECT "partnerDealId",count(*) FROM "CosEngagement" WHERE "partnerDealId" IS NOT NULL GROUP BY 1 HAVING count(*)>1;   -- only if CosEngagement already exists
-- orphaned links and the size of the v2 backfill come from the read-only tooling, not hand-written SQL:
--   scripts/growthos-v2-ops.ts check-links   (expect 0 orphans)      scripts/growthos-v2-ops.ts backfill   (dry-run: review the counts)
```

**Procedure (staging first, then production, same steps):**
1. Restore point: create and **name** a Neon branch / snapshot of the target; write the name and time in `GROWTHOS_RELEASE_PROGRESS.md`. Confirm you can open it.
2. Generate the SQL, do not apply it: `npx prisma migrate diff --from-url "<target URL from your shell, not from .env>" --to-schema-datamodel prisma/schema.prisma --script > rollout.sql`. Read every statement. Expected: `CREATE TABLE`, `ALTER TABLE … ADD COLUMN` (nullable or defaulted), `CREATE INDEX`, and the one index swap. **Any `DROP TABLE`, `DROP COLUMN`, `ALTER COLUMN … TYPE` or `SET NOT NULL` without a default ⇒ stop.**
3. Apply the index swap SQL by hand (above), then `npx prisma db push` with the target `DATABASE_URL` passed explicitly on the command line. It must print **no warning**. If it asks to accept data loss, stop and compare with `rollout.sql`. (Repo rule: schema changes go through `db push`, additive only. `.env` on the dev machine holds live values and Prisma auto-loads it — an explicit URL is mandatory.)
4. **Schema before code.** Every addition is ignored by the old build, so the old build keeps working; the new build would fail on a missing column. Deploy the code after the push.
5. v2 note steps 1, 5 and 6 still apply (secret rotation, backfill, `rotate-keys` with `unreadable` = 0). Backfill: `scripts/growthos-v2-ops.ts backfill` dry-run → review counts → `--apply`. The AI-credit change needs no backfill: defaults make every historical AI usage row Catalyst-paid, and existing contracts grant no AI tools.
6. Post-change verification: `npx prisma migrate diff --from-url … --to-schema-datamodel prisma/schema.prisma --exit-code` returns 0 (no drift); `/admin/os` loads; `/admin/os/credits` shows every wallet's "Ledger check" as OK (there will be none yet); existing connections still list in the workspace (they need one reconnect each to record capabilities — v2 note); one existing client can sign in and open Work.
7. **Recovery.** Code rollback alone is safe (older code ignores the additions). Schema removal is only for a rollout that failed *before* any real use: restore the named branch/snapshot. Once a real credit has been granted or a contract signed on the new schema, do not drop anything — `CosCreditLedger` is a financial record; fix forward.
