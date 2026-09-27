# GrowthOS testing — quick start (what to do first, in order)

You are testing branch `growthos-v2` as it stood on 2026-09-22 (release candidate report dated 2026-09-21; nothing committed, deployed or live-verified). Read this page, then follow the guide.

## 0. The pack

| File | Use it for |
|---|---|
| `GROWTHOS_TESTING_QUICK_START.md` | this page |
| `GROWTHOS_TEST_ACCOUNTS_AND_DATA.md` | environments, safety checks, seed data, accounts, fixtures, evidence folder |
| `GROWTHOS_MANUAL_TEST_GUIDE.md` | setup, journeys, run sequences, defect template, every test case in full |
| `GROWTHOS_TEST_CASES.csv` | the same 229 cases as a spreadsheet (one row each, 22 columns) |
| `GROWTHOS_TEST_RUN_TRACKER.csv` | fill in Result / Tester / Date / Evidence / Defect per test (all start as **Not run**) |
| `GROWTHOS_TEST_COVERAGE_MATRIX.csv` | 64 requirements + 88 features → routes/actions → roles → states → test IDs → gaps |
| `GROWTHOS_TESTING_GAPS_AND_DECISIONS.md` | what is missing, what needs configuration, what the owner must decide |

## 1. Thirty-minute setup (do once)

```powershell
pg_ctl -D "$env:LOCALAPPDATA\growthos-devdb" -o "-p 54329" start
node scripts/local-db-push.mjs
node scripts/mark-disposable-db.mjs growthos_dev growthos_test
npm run seed:growthos-demo
npm run seed:price-book
node scripts/dev-verify.mjs
```

In a second PowerShell window keep the scheduler running for the whole session:

```powershell
$env:CRON_SECRET='local-dev-cron-secret'; $env:LOCAL_TICK_URL='http://localhost:3100/api/os/tick'; npm run tick:local
```

Base URL: **http://localhost:3100**. Client app at `/app/login`, operator portal at `/admin/login` (credentials are the `ADMIN_ACCOUNTS` entry in `scripts/dev-verify.mjs`), partner portal at `/partner/login`. Demo accounts and the synthetic password are printed at the end of the seed.

If the server refuses to start with a "disposable" error, re-run the mark script with the exact database names. Never run it against anything hosted.

## 2. The first five tests to run

| # | Test | Why first |
|---|---|---|
| 1 | **SETUP-01 → SETUP-04** | proves the environment, the fail-closed database guard and the scheduler loop; nothing else is meaningful without them |
| 2 | **AUTH-01** (login/logout as the owner) | the release report's "smallest owner check": sign in once by hand — this was never done in a browser |
| 3 | **AI-06** (LinkedIn post: quote → run → save) followed by **CRD-01** | the core client value path and the wallet arithmetic in one pass |
| 4 | **CONT-04 → CONT-05 → CAL-01** | editorial approval, per-variant revocation on edit, scheduled publish once via the test adapter |
| 5 | **SCOPE-06** and **AIX-12** | the four independent controls (scope / tool entitlement / credits / permission) and "Catalyst never silently debits the client" |

Then run **Run 1 — smoke** in the guide (about 45 minutes), and only after that the full client acceptance journey.

## 3. What you can and cannot test locally

Locally (dev-verify): everything mechanical — 190 of 229 cases. AI drafts are `[TEST DRAFT]` placeholders from the stand-in model; the test publishing adapter posts nowhere; email is logged to the console; payments are closed.

Needs configuration or staging (39 cases, marked in the Environment column): real model usefulness (check 1), image generation (2), web research (3), Vercel Blob (4), Stripe test-mode purchase/refund/dispute (5), scheduler trigger soak (6), real email (7), and every live publishing format (8–12). Procedures: `GROWTHOS_EXTERNAL_CHECKS.md`; environment: `GROWTHOS_STAGING_SETUP.md`.

## 4. Rules while testing

- Only synthetic `@growthos-test.example.com` / `@growthos-demo.example.com` people. Never a real lead, client or card.
- Never publish to a public account without the written authorisation named in the test's "External access" field.
- An **uncertain** publication or AI run is never "tried again" — a person reconciles it as the product asks.
- Do not change application behaviour to make a test pass. Record the discrepancy.
- Historical automated results (51 files / 578 tests on 2026-09-21) are cited in the guide as evidence of the build, not as manual passes. The tracker starts entirely at Not run.

## 5. Recording

Fill `GROWTHOS_TEST_RUN_TRACKER.csv`; put screenshots and logs in `growthos-manual-evidence/<date>/` (see accounts file §6); log defects with the template in the guide §9. When a P0 fails, stop the journey it belongs to, log it, and continue with independent journeys.
