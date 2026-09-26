# GrowthOS — external setup checklist

Names only — never put values in git. Nothing below has been live-verified from this repository; every integration
is **Externally blocked** until its row is completed and a real round-trip succeeds.

## Local databases (done on this machine)
- Postgres 18 cluster: `%LOCALAPPDATA%\growthos-devdb`, port `54329`, user `growthos`, dbs `growthos_dev`, `growthos_test`.
- Start: `pg_ctl -D "$env:LOCALAPPDATA\growthos-devdb" -o "-p 54329" -l "$env:LOCALAPPDATA\growthos-devdb\server.log" start` · Stop: `pg_ctl -D "$env:LOCALAPPDATA\growthos-devdb" stop`
- `.env.development.local` → `DATABASE_URL`, `LEADOS_SECRET` (local), blanked live keys, `GROWTHOS_SELF_SERVICE=off`, `ASSET_STORAGE=local`, `GROWTHOS_TEST_ADAPTER=1`.
- `.env.test.local` → `TEST_DATABASE_URL` (must be localhost and end in `_test`).
- Schema: `$env:DATABASE_URL="postgresql://growthos@localhost:54329/growthos_dev"; npx prisma db push` (repeat for `growthos_test`).
- **Mark each throwaway database once** (tests, seeds, wipes and the dev server refuse an unmarked one, even on localhost): `node scripts/mark-disposable-db.mjs growthos_dev growthos_test`. Never run it against anything real.
- A new machine: `initdb -D <dir> -U growthos -A trust -E UTF8 --locale=C`, start it, `create database growthos_dev; create database growthos_test;`.

## Core configuration
| Name | Purpose | Required |
|---|---|---|
| `LEADOS_SECRET` | field-encryption key (tokens, MFA secrets). **Now mandatory** | yes |
| `LEADOS_LEGACY_SECRET` | the OLD key, only while legacy ciphertext exists (see rotate-keys) | if rotating |
| `ADMIN_SESSION_SECRET` | admin + partner session signing. **No fallback any more** | yes |
| `CRON_SECRET` | bearer for `/api/os/tick`, `/api/leados/cron`, `/api/cron/nurture` | yes |
| `GROWTHOS_SELF_SERVICE` | `on` re-opens public sign-up / org creation. Default off | no |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | checkout + signed webhook `/api/stripe/webhook` | for card payments |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | text AI | for AI drafting |
| `LLM_PRICE_INPUT_MICROS_PER_MTOK`, `LLM_PRICE_OUTPUT_MICROS_PER_MTOK` | micro-USD per million tokens → internal cost. Unset ⇒ cost shown as unknown | no |
| `IMAGE_API_BASE_URL`, `IMAGE_API_KEY`, `IMAGE_MODEL`, `IMAGE_SIZE` | OpenAI-compatible Images API. Unset ⇒ "Requires setup" | no |
| `ASSET_STORAGE` | `local` (dev) or `vercel_blob`; `BLOB_READ_WRITE_TOKEN` + `npm i @vercel/blob` for the latter | production |
| `GROWTHOS_TEST_ADAPTER` | `1` enables the TEST publishing account — ignored in production | dev only |
| `LINKEDIN_API_VERSION`, `META_GRAPH_VERSION` | provider API versions (defaults `202609`, `v25.0`) — review every quarter | no |
| `LINKEDIN_SCOPES`, `META_SCOPES` | override requested scopes once the app is approved for more | no |

## Scheduler (time-sensitive work)
Call `GET https://app.<domain>/api/os/tick` with `Authorization: Bearer $CRON_SECRET` every 1–5 minutes (Vercel Pro cron
`*/5 * * * *`, or an external scheduler). It publishes due posts, resumes workflow waits, generates recurring cycles, sends renewal
reminders, expires approvals and syncs metrics. `/admin/os` shows a red banner when the last run is older than 15 minutes.
The existing daily `/api/leados/cron` stays as a safety net.

## Stripe
1. Dashboard → Developers → Webhooks → endpoint `https://app.<domain>/api/stripe/webhook`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`.
2. Put the signing secret in `STRIPE_WEBHOOK_SECRET`. Docs: https://docs.stripe.com/webhooks#verify-manually
3. Verify with a test-mode payment: the token purchase must credit once even if the success tab is closed.

## Providers
Redirect URIs for every OAuth provider: `https://app.<domain>/api/os/connect/<provider>/callback` and `http://localhost:3000/...` (`<provider>` = `gsc`, `youtube`, `linkedin`, `x`, `meta`).

| Platform | What is needed outside this repo | Env | Official docs |
|---|---|---|---|
| Google Search Console + GA4 | Cloud project, OAuth consent screen verified for `webmasters.readonly`, `analytics.readonly`; user owns the property; GA4 property id entered in Settings | `GOOGLE_CLIENT_ID/SECRET` | https://developers.google.com/webmaster-tools/v1/searchanalytics/query · https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport |
| YouTube (long-form + Shorts) | Same project with YouTube Data API v3 + YouTube Analytics API enabled; scopes `youtube.upload`, `youtube.readonly`, `yt-analytics.readonly`; **API audit** — until it passes, uploads are locked to private; daily quota (an upload costs ~1,600 units of the default 10,000) | same | https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol · https://developers.google.com/youtube/analytics/reference/reports/query |
| X | Developer account on a tier that allows `POST /2/tweets` and reading `public_metrics`; OAuth 2.0 with PKCE; scopes `tweet.read tweet.write users.read offline.access`. Media posts are not implemented | `X_CLIENT_ID/SECRET` | https://docs.x.com/x-api/posts/create-post |
| LinkedIn personal profile | App with "Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect"; scope `w_member_social`. Post statistics for members need `r_member_social` (restricted) → record by hand | `LINKEDIN_CLIENT_ID/SECRET` | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api |
| LinkedIn company page | **Community Management API** approval; then set `LINKEDIN_SCOPES` to include `w_organization_social r_organization_social rw_organization_admin`; the signing-in member needs an ADMINISTRATOR / CONTENT_ADMIN page role. Page analytics adapter is not implemented yet | same | same + https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control-by-role |
| Facebook Pages | Meta app, business verification, **App Review** for `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`, `business_management`; user must be able to create content on the Page. Insights adapter not implemented | `META_APP_ID/SECRET` | https://developers.facebook.com/docs/pages-api/posts |
| Instagram | Professional account linked to a Page; App Review for `instagram_basic`, `instagram_content_publish`; **media must be at a public URL** ⇒ production asset storage first; 100 API posts / 24 h | same | https://developers.facebook.com/docs/instagram-platform/content-publishing |
| WordPress | Per site: an **application password** for an Editor/Author user (Users → Profile); REST API reachable over https | none | https://developer.wordpress.org/rest-api/reference/posts/ |
| Image generation | Any OpenAI-compatible Images endpoint + key; check the provider's commercial-use terms | `IMAGE_*` | https://platform.openai.com/docs/api-reference/images/create |
| Asset storage (production) | Vercel Blob store + read/write token; `npm i @vercel/blob` | `ASSET_STORAGE`, `BLOB_READ_WRITE_TOKEN` | https://vercel.com/docs/vercel-blob |

Live verification per provider = connect a real (or sandbox) account in Settings → Connections, publish one approved test variant, confirm the link,
confirm one metric sync, then record the date in `GROWTHOS_VERIFICATION.md`. The connection row stores `liveVerifiedAt` when a real call succeeds.
