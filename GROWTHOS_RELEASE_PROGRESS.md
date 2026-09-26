# GrowthOS — release pass progress · 2026-09-21

Starts from `GROWTHOS_FINAL_VERIFICATION.md` (49 files / 555 tests, nothing committed). State re-checked before acting: branch `growthos-v2`, 172 changed paths, last commit `c807a23`, all preserved. Report: `GROWTHOS_RELEASE_CANDIDATE_REPORT.md`.

## Tasks
- [x] 1A Studio brief → draft campaign (`saveBriefAsCampaign`, `studioSaveCampaign`, run page form, `createCampaign` studio option)
- [x] 1B Five data-returning LeadOS actions (+ `previewCanvas`) return refusals; callers show them
- [x] 1C Facebook Page video adapter (`publishFacebookVideo`, `facebook.video` format) — fixture-tested only
- [x] 1D Low-balance email (`lowBalanceNotice`; wallet columns `lowBalanceEmail`, `lowArmed`, `lowNotifiedAt`; opt-out on the AI credits page; scheduler sweep)
- [x] 1E Video generation: no approved provider in any decision file ⇒ recorded as an unresolved optional integration; human path confirmed complete and labelled
- [x] 2 Timeout/crash: metered timeout not re-sent; attempt `uncertain`; `providerRequestId` kept; late-answer and restart tests
- [x] 3 Journeys from the real `login` action (`tests/os/release-journeys.test.ts`); operator access guard for production
- [x] 4 Desktop + 375 px checks of 9 client/operator screens; two overflow defects fixed
- [x] 5 `GROWTHOS_STAGING_SETUP.md`, `GROWTHOS_EXTERNAL_CHECKS.md` (nothing provisioned)
- [x] 6 Database rollout review (staging doc §6; change note updated to 11 columns)
- [x] 7 typecheck 0 · vitest 51 files / 578 tests, exit 0 · isolated production build 0 — `growthos-release-evidence/`
- [x] 8 Diff review + suggested commit grouping (no commit: not authorised)
- [x] 9 Release report, requirement matrix (64 rows, new "Release pass" column), this file

## Decisions made in this pass
43. A Studio brief becomes a campaign only as a **draft** created under `ai.use`; clients gain no campaign management. Provenance lives in the campaign's first `CosRevision`, the audit event and the run's `savedTo` (no new column). One campaign per run, enforced by a row lock on the operation.
44. A **metered** model call that times out is not re-sent. The client's hold is released (they received nothing, and a request/response API cannot deliver late); the attempt is `uncertain` and its cost NULL. Non-metered pipelines keep their retries.
45. Low-balance email: billing members of that workspace only; one per episode; 24 h cooldown; re-arm on recovery or a changed level; held credits do not count as low for the email (they do show in the in-app notice).
46. Facebook video keeps two identities across retries — the uploaded file handle and the accepted video id — so a "still processing" retry only polls.
47. The local verification operator secret is refused outright in production.
48. Hosted schema rollout: reviewed SQL diff first, the `CosConnection` index swap as explicit SQL, never `--accept-data-loss`, schema before code. Supersedes the "deploy, then push" order in the two change notes.
49. Pause policy **verified, not changed**: staff-only; skips recurring cycles; does not hold approved scheduled posts (kill switch does). Owner to confirm.

## Blockers (all external or owner decisions)
Staging database + Blob store · text-model key · scheduler secrets · prices/tax + Stripe test keys · search plan · X tier · LinkedIn/Meta/Google approvals · screen-reader pass · permission to commit. Exact actions: release report §10.

## Known limits of this pass
Browser sessions were dev-injected (the assistant does not type passwords); login is proven at the action level. Screenshots could not be written to disk. No screen reader. Nothing external was contacted.
