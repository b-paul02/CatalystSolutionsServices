# GrowthOS upgrade — implementation plan

Baseline: `GROWTHOS_CURRENT_STATE_AUDIT.md` (commit `c807a23`, branch `growthos`). Work branch: `growthos-v2`.
Status of every requirement lives in `GROWTHOS_PROGRESS.md`; choices in `GROWTHOS_DECISIONS.md`; executed checks in
`GROWTHOS_VERIFICATION.md`; owner/provider setup in `GROWTHOS_EXTERNAL_SETUP.md`.

**On context loss: read PROGRESS first, then continue at the first row that is not `Tested`/`Externally blocked`. Do not re-audit.**

## Principles
- Extend, don't rewrite. The work-item engine, hash-bound approvals, RBAC separation of duties, `requireOrg`, entitlements,
  job queue, kill switch, LeadOS consent/suppression, workflow engine and partner ledger stay as they are.
- All schema changes additive (`Cos*` prefix, `prisma db push` on the LOCAL database only). Production apply is a checklist item, never done here.
- New tenant-owned tables carry `orgId` with a real FK to `LosOrg` and FKs to their parents; code asserts parent.orgId === actor.orgId.
- External actions go through `gateAction` + kill switch + atomic claim. No adapter ever reports success it did not get from the provider.
  Without credentials the adapter is `Requires setup`; acceptance uses an explicit TEST adapter, labelled test-verified.
- Prices, allowances, review cycles, fees: configurable fields, never invented defaults presented as commercial truth.

## Dependency order

| # | Phase | Scope (brief section) | Key outputs |
|---|---|---|---|
| 0 | Safety | A | local Postgres (dev + `_test`), fail-closed db guard, crypto key versioning, no `dev-secret`, live keys blanked in dev |
| 1 | Shared model | D | all new tables + additive columns in one reviewed schema change; `prisma/changes/2026-09-growthos-v2.md` |
| 2 | Foundations | A | entitlement enforcement (pages, actions, API, jobs), read-only access mode, self-service gate, Stripe webhook, tick route + heartbeat, workspace timezone, `deliveredAt`, AI usage ledger, demo exclusion, report period/currency fixes |
| 3 | Engagements | B | lifecycle + holds + payment status, structured discovery, access/asset checklist, dependencies, blockers, kickoff, roadmap, change requests, cycles, renewal reminders, handover/export |
| 4 | Service templates | E | 14 templates: intake, deliverables, milestones+dependencies, roles, QA, client decisions, acceptance, measures, recurring |
| 5 | Assets | G | storage adapter (local + production), library, versions, rights, previews, export; image-generation adapter; video production pipeline |
| 6 | Content Studio | F | campaigns + briefs, sources/claims, master → variants, revisions, comments, per-variant approvals, previews/validation, calendar filters, bulk actions, duplicate guard, AI draft/rewrite/repurpose |
| 7 | Accounts + publishing | H | multi-account connections, capability model, channel adapters (X, LinkedIn member/org, Facebook Page, Instagram, YouTube, WordPress), publications + attempts, tz-aware scheduler, retries, reconciliation, partial success, notifications |
| 8 | Analytics + outcomes | I | metric catalogue, snapshots (daily vs lifetime), analytics adapters (+GA4, GSC), tagged URLs, lead↔campaign link, opportunities + recorded sales, 3 report views, grounded narratives |
| 9 | Commercial + recurring | J | partner deal → org/engagement link, commercial records, payment events, recurring generation, renewal/pause, capacity view |
| 10 | Role UX | C | client nav (Home, Growth Plan, Work, Content, Approvals, Results, Assets, Engagement, Settings, Leads) and operator console; states for loading/empty/blocked/error/disconnected |
| 11 | Verification | K, L | unit + DB tests per priority list, 15-step acceptance test, synthetic demo seed, browser checks, handoff |

UX (10) is built alongside each phase; phase 10 is the cohesion pass.

## Target data model (new = **bold**)

```
LosOrg ─┬─ CosWorkspace (+timezone, accessMode)
        ├─ **CosEngagement** ─┬─ CosContract (+engagementId)      ├─ **CosEngagementEvent** (append-only)
        │                     ├─ CosGoal (+engagementId)          ├─ **CosChecklistItem** (access/asset/input)
        │                     ├─ **CosCampaign** (marketing; ≠ LosCampaign, linked via LosCampaign.marketingCampaignId)
        │                     ├─ **CosCycle** (unique engagement+periodStart)
        │                     └─ **CosCommercialRecord** ── **CosPaymentEvent** (unique providerEventId)
        ├─ **CosBusinessProfile** · **CosSource** · **CosClaim**
        ├─ CosWorkItem (+engagementId, goalId, campaignId, cycleId, responsibility, deliveredAt, acceptance)
        │      ├─ **CosDependency** (work item ← work item | checklist item)
        │      ├─ **CosContentVariant** ── **CosPublication** ── **CosPublishAttempt**
        │      └─ CosApproval (+variantId) · CosWorkEvent (+variantId) · **CosRevision**
        ├─ **CosAsset** ── **CosAssetVersion**
        ├─ CosConnection (+accountType, externalAccountId, capabilities; unique org+provider+externalAccountId)
        ├─ **CosMetricSnapshot** (dimKey: org | acct | pub | camp | url; kind daily|lifetime)
        ├─ LosLead (+marketingCampaignId, variantId, utm*, attributionKind) ── **CosOpportunity** (value, currency, closeDate)
        ├─ **CosAiUsage** · **CosNotification** · **CosHeartbeat**
        └─ partner Deal (+losOrgId, engagementId — idempotent link)
```

Traceable chain: Engagement → Goal → Campaign/Project → Work/Content → Variant → Publication/Deliverable → MetricSnapshot /
LosAttributionEvent → LosLead → CosOpportunity (won = recorded sale). Non-lead services close through acceptance evidence + goal measures.

## Legacy relationship staging (no restrictive constraints yet)
1. (this release) New tables get FKs. Legacy `Cos*` string `orgId`/parent ids stay; `scripts/check-legacy-links.ts` reports orphans read-only.
2. (next) Fix orphans from that report; add FKs `NOT VALID`, then `VALIDATE` table by table.
3. (later) Fold `CosMetricPoint` into `CosMetricSnapshot`; `CosWorkspace.brandProfile` JSON into `CosBusinessProfile` (read-fallback exists now).
