# Gate 1 Qualification Scoring — DRAFT thresholds, tune after first 50 leads

Derived from the Catalyst G1 checklist: fit, urgency, budget context, decision makers, red flags. Scored silently from intake answers + scrape signals. Score 0–100. The user never sees any of this.

## Dimensions & weights

**Service fit — 25 pts**
- Selected services map to Catalyst families with clear evidence of need in scrape/answers: 25
- Partial fit or "not sure, help me decide" with a diagnosable business: 15
- Weak fit (needs Catalyst doesn't serve, e.g., pure offline retail with no digital intent): 5

**Budget context (Q12) — 25 pts**
- Range stated and ≥ mid band: 25 · Range stated, low band: 15 · "Prefer to discuss": 12 · Skipped: 8
- (Never treat "prefer to discuss" as a red flag — the deck's rule is budget context, not a quote.)

**Timeline urgency (Q11) — 20 pts**
- ASAP or hard deadline/event: 20 · Within 1 month: 16 · 1–3 months: 12 · Exploring: 6

**Decision authority (Q13/intake) — 15 pts**
- "Just me" or "me + partner": 15 · "A team" / procurement involved: 10 · Unknown: 7
- (Team/procurement isn't bad — it's slower; the score reflects sales-cycle friction, not lead quality. Reviewer sees the raw answer.)

**Business maturity (scrape signals) — 15 pts**
Award 3 pts each, cap 15: live professional site · evidence of trading (clients, products, reviews) · any analytics/tracking detected · active content or social in last 90 days · team size 11+ (Q3).

## Thresholds (configurable)
- **≥ 65 → `priority`** — reviewer prompted to personalize the CTA line; report review SLA same business day if possible.
- **40–64 → `standard`** — normal queue, 1-business-day SLA.
- **< 40 → `nurture`** — report still generated and delivered (value-first principle), lead tagged for the nurture sequence, no personalized CTA. Reviewer may override upward with reason.

## Red flags (reviewer alert, never auto-reject)
Disposable email domain · scrape finds parked/dead site · industry conflict with an active client · request outside all 13 families · abusive/spam content in free-text answers. Any flag pins a warning on the review card; the human decides. A polite decline is a valid outcome and is recorded on the lead for re-engagement, per the operating model.

## TODO
- [ ] Tune weights/thresholds after the first 50 leads against actual booked-call and close rates
- [ ] Add industry conflict list once client roster exists
