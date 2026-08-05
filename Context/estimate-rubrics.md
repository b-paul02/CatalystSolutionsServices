# Estimate Rubrics — DRAFT, calibrate before launch

> **STATUS: DRAFT.** Baselines below are reasonable industry-typical starting points derived from the service catalogue. Baisali/Catalyst must adjust every number to actual team speed before the tool goes live. The under-commit rule is already applied: public timeline = internal estimate + ~30%. If you change internal estimates, keep that padding.
>
> How the pipeline uses this file: ModuleAnalyst nodes read their family's rubric to attach effort levels and timeline ranges to route elements. The report NEVER shows prices or person-days — only effort level (low/medium/high) and the padded timeline range.

## Format
Each line: element · internal effort (person-days) · complexity multipliers · internal timeline → **public timeline (padded)** · effort label.

## Module: Lead Generation (B2B outbound + B2C campaign planning)

| Element | Effort (pd) | Internal | Public timeline | Label |
|---|---|---|---|---|
| ICP validation & refinement | 2–3 | 1 wk | 1–2 weeks | Low |
| B2B lead list build + enrichment (500–1,000 contacts) | 3–5 | 1–2 wk | 2–3 weeks | Low–Med |
| Cold email infrastructure (domains, warmup, deliverability) | 2–3 setup + 2–3 wk warmup | 3–4 wk | **4–6 weeks before first sends** | Med |
| Outreach sequence copy (3–5 touch) | 2–3 | 1 wk | 1–2 weeks | Low |
| Full lead-gen campaign live (landing page + tracking + forms) | 8–12 | 3–4 wk | 4–6 weeks | Med–High |
| B2C: audience definitions + creative angles + funnel plan | 4–6 | 2 wk | 2–3 weeks | Med |

Multipliers: no existing CRM ×1.3 · regulated industry (finance, health, legal) ×1.4 · multi-market/multi-language ×1.5.
Hard truth the report must state: cold outbound needs 4–6 weeks of infrastructure + warmup before meaningful volume; reply rates take a further 2–4 weeks to calibrate.

## Module: SEO & AI Search Visibility

| Element | Effort (pd) | Internal | Public timeline | Label |
|---|---|---|---|---|
| SEO audit (technical + content + competitor) | 4–6 | 1–2 wk | 2–3 weeks | Low–Med |
| Technical fixes (indexing, schema, speed) | 5–10 | 2–3 wk | 3–5 weeks | Med |
| On-page optimization (per 10 pages) | 3–5 | 1–2 wk | 2–3 weeks | Low–Med |
| Local SEO setup (GBP + citations, per location) | 3–4 | 2 wk | 2–4 weeks | Low |
| Content engine start (calendar + first 4 articles) | 6–8 | 3–4 wk | 4–6 weeks | Med |
| AI search visibility (AEO/GEO) baseline + fixes | 4–6 | 2–3 wk | 3–4 weeks | Med |

Multipliers: site >50 pages ×1.4 · previous penalty/migration history ×1.5 · ecommerce catalog ×1.6.
Hard truth the report must state: meaningful organic movement takes 3–6+ months; nothing in month 1 is a ranking result — month 1 is foundation.

## Module: Website Design & Development

| Element | Effort (pd) | Internal | Public timeline | Label |
|---|---|---|---|---|
| Landing page (design + build + tracking) | 4–6 | 1–2 wk | 2–3 weeks | Low–Med |
| 5–7 page business site (new, on standard platform) | 15–25 | 4–6 wk | **6–9 weeks** | High |
| Redesign of existing site (same size) | 18–28 | 5–7 wk | 7–10 weeks | High |
| Speed optimization pass | 3–5 | 1 wk | 1–2 weeks | Low |
| Conversion optimization sprint (audit + top fixes) | 5–8 | 2–3 wk | 3–4 weeks | Med |
| CMS setup + training | 2–4 | 1 wk | 1–2 weeks | Low |

Multipliers: client provides no copy/images ×1.4 (content is the #1 delay) · custom integrations (CRM, booking, payments) ×1.3 each, cap ×1.8 · ecommerce ×1.5.
Hard truth the report must state: the most common website delay is client-side content and approvals — timelines assume materials arrive on schedule; state this as an explicit assumption.

## Global rules (all modules)
- If two elements share a dependency (e.g., tracking must precede ads), timelines are sequential, not parallel — the analyst must chain them.
- "Quick win" = completable within 30 calendar days at ≤5 person-days effort with no blocking dependency. If it fails any test, it is not a quick win.
- When the evidence pack lacks the data a multiplier needs, assume the multiplier applies and note the assumption — never assume the cheap case.

## TODO for Catalyst before launch
- [ ] Replace draft person-day baselines with actual team velocity (pull from past projects)
- [ ] Add rubrics for the next modules before enabling them (ads, social, content are likely next)
- [ ] Review the 30% padding after the first 5 delivered engagements — widen it if anything ran late
