# AI-credit pricing — proposal for owner review (2026-09-21)

**Status: a proposal.** Nothing here is live. The rates pre-fill the draft form on `/admin/os/credits`; packs are listed there but not created. A real rate card can only be activated if it passes the margin check in `lib/os/pricing.ts` (floor `AI_MIN_MARGIN_PCT`, default 70%). The activation floor is exercised by `tests/os/completion-pricing.test.ts` (worst-case model cost against the cheapest credit); that test is a guard against selling below cost, not a profit forecast — see section 4.
Not included and yours to decide: GST / sales tax treatment (prices below are assumed **exclusive** of tax), rounding to local price points, launch promotions.

## 1. What a run costs Catalyst
The platform is configured for `gemini-flash-lite-latest`. Google's published paid-tier list prices (checked 2026-09-21): Flash-Lite 3.5 **$0.30 / $2.50** per million input / output tokens; cheapest image model about **$0.034** per image. Use the **paid** tier for client work: the free tier lets Google use the content to improve its products.
Worst case budgeted per run: 7,000 prompt tokens (brand profile, approved claims, sources), output at the *longest* limit, and one JSON-repair retry (×2). Examples: LinkedIn post ≈ $0.009 · article draft ≈ $0.034 · YouTube script ≈ $0.027 · image ≈ $0.034. Typical runs cost a third of that.
Headroom scenario ("premium"): a Sonnet-class text model at $2 / $10 and a premium image model at $0.13.

## 2. Proposed packs
| Market | Pack | Credits | Price | Per credit |
|---|---|---|---|---|
| US | Starter | 250 | $25 | $0.100 |
| US | Growth | 600 | $49 | $0.082 |
| US | Scale | 1,500 | $99 | $0.066 |
| IN | Starter | 250 | ₹1,999 | ₹8.00 |
| IN | Growth | 600 | ₹3,999 | ₹6.67 |
| IN | Scale | 1,500 | ₹7,999 | ₹5.33 |

Margins are computed against the **cheapest** credit (IN Scale ≈ $0.057 after a 6% payment-fee allowance, at an assumed ₹88 / $ — set `AI_FX_INR_PER_USD` to the real rate). Purchased credits do not expire.

## 3. Proposed rate card — credits per run = base + 4 per 1,000 output tokens
| Tool group | Base | Typical charge | Highest quote (long) |
|---|---|---|---|
| X post | 1 | 2 | 3 |
| LinkedIn post, caption, X thread, carousel copy, Shorts script, outline, SEO brief | 2 | 3–6 | 6–10 |
| Campaign brief, calendar, web copy, email sequence, repurpose, performance summary | 3 | 6–10 | 8–16 |
| YouTube script | 3 | 10–14 | 21 |
| Article draft | 3 | 12–18 | 27 |
| Image | 10 flat | 10 | 10 |
| Web research (optional, per run, on top of the tool) | +2 flat | +2 | +2 |

The client is quoted the maximum, charged on what is actually produced, and never above the quote.

## 4. Illustrative unit economics (not a margin claim)
Earlier drafts of this document led with single margin percentages. Those were worst-case *gross* figures on model cost alone and read as more certain than they are. This section replaces them with the calculation itself. **No price or tax setting was changed.** Every number marked *assumed* is a placeholder for a fact only the owner or a provider invoice can supply.

**A. Realised revenue per credit** (what a credit actually earns, before tax)
| Source of the credit | List price | Less assumed 6% payment cost | Note |
|---|---|---|---|
| Purchased, US Starter / Growth / Scale | $0.100 / $0.082 / $0.066 | $0.094 / $0.077 / $0.062 | real fee = card rate + fixed fee per order; the fixed part weighs more on the $25 pack |
| Purchased, IN Starter / Growth / Scale | ₹8.00 / ₹6.67 / ₹5.33 | ≈ $0.085 / $0.071 / $0.057 at an *assumed* ₹88 per $ | FX moves; GST not modelled |
| **Included** credits (in a signed scope) | none at the point of use | **$0** | paid for inside the engagement fee; how much of that fee is attributed to them is an accounting decision, so each included credit consumed is shown below as pure cost |
| **Promotional** / adjustment credits | none | **$0** | pure cost, by design |
| Blended revenue per credit | — | **unknown** | depends on the pack mix and the included : purchased ratio, which do not exist yet |

**B. Direct cost of a run at today's configuration** (Gemini Flash-Lite paid tier, list price $0.30 / $2.50 per million input / output tokens; image ≈ $0.034; web search *assumed* $0.005–0.009 per query — no plan has been bought)
| Example run | Credits charged | Model cost (typical → worst case) | Search | Cost incl. failures¹ | Revenue at cheapest purchased credit ($0.057) | Same run on included credits |
|---|---|---|---|---|---|---|
| LinkedIn post (≈300 output tokens) | 4 | $0.002 → $0.009 | — | ≈ $0.0023 | $0.228 | revenue $0, cost $0.0023 |
| Article draft (≈3,000 output tokens) | 15 | $0.009 → $0.034 | — | ≈ $0.011 | $0.855 | revenue $0, cost $0.011 |
| Researched blog outline (≈800 output tokens) | 6 + 2 | $0.0035 → $0.014 | $0.009 *assumed* | ≈ $0.016² | $0.456 | revenue $0, cost $0.016 |
| Image | 10 | $0.034 (one call, no retry) | — | ≈ $0.037 | $0.570 | revenue $0, cost $0.037 |

¹ *Assumed* 10% of runs fail after the provider was paid (provider error, validator discard) and 5% need a JSON-repair call; the client is never charged for a failed run, so that cost is carried by the successful ones. Real rates are unknown until a live model is used.
² Researched runs are *assumed* to fail more often (20%) because a fabricated or missing citation discards the draft — and the search has already been paid for.

**C. What this does and does not show.** On purchased credits the direct variable cost of a run is a few percent of what the run earns, even at the cheapest pack and with the failure assumptions above; on a model roughly seven times dearer it would be roughly seven times that share. On included or promotional credits every run is a small pure cost. That is a statement about *direct variable cost under the listed assumptions*, not a profit margin.

**Included in the figures:** model tokens, image calls, web searches, an assumed payment cost, assumed failed / retried runs.
**Excluded (not modelled at all):** GST / sales tax; refunds, chargebacks and dispute fees; FX spread; hosting, database, storage and bandwidth; the scheduler; support and staff time; Catalyst's own internal AI use (paid by Catalyst by design); the cost of included and promotional credits as a share of the engagement fee; unused-credit liability (purchased credits do not expire).
**Unknown inputs the owner must supply before any margin can be stated:** the real payment-provider rate for each market; the FX rate used for INR packs; the search plan and its per-query price; real failure and retry rates; typical prompt size for real workspaces (brand profile and source volume drive input tokens); the pack mix; the included : purchased credit ratio; tax treatment.

**What the code enforces instead of a headline number.** A real rate card cannot be activated unless, for every priced tool, the *worst-case* model cost (7,000 prompt tokens, longest output limit, one repair retry) stays under the configured share of the *cheapest* purchased credit after the payment allowance (`AI_MIN_MARGIN_PCT`, default 70), and activation is refused outright when a needed price is missing. That guard deliberately ignores included credits, failures and every excluded cost above — it is a floor against selling below model cost, not a profitability forecast. `/admin/os/credits` shows the same table and the realised 30-day figure once real usage exists.

## 5. Is it competitive?
Reference points (published 2026 pricing): Jasper Pro about **$59–69 per seat per month**; Writesonic from **$79/month**; Copy.ai workflow credits start far higher. Those are standalone subscriptions with no brand context or approval flow.
A busy client month here — 60 social posts, 8 threads, 4 articles, 4 email sequences, 10 images — is roughly 60×4 + 8×6 + 4×15 + 4×9 + 10×10 = **≈ 480 credits ≈ $40 (Growth pack)**, shared across the whole team, with no seat fee and nothing to pay in a quiet month. A light user spends $10–15. That undercuts a single Jasper seat while direct model cost stays a small share of what each run earns (section 4), which is the right position for a tool that is an add-on to a managed engagement rather than the product itself.
If you want to be more aggressive, the lever with the least risk is pack size (e.g. 300 credits for $25), not per-tool rates; re-run the test to confirm the floor holds.

## 6. To make it live (when decided)
1. Env: `LLM_PRICE_INPUT_MICROS_PER_MTOK=300000`, `LLM_PRICE_OUTPUT_MICROS_PER_MTOK=2500000`, `IMAGE_PRICE_MICROS=33600` (update when the provider or model changes), `AI_FX_INR_PER_USD=<rate>`, optional `AI_MIN_MARGIN_PCT`.
2. `/admin/os/credits` → create the packs you accept → save the rate-card draft → check the Profitability table → Activate.
3. Review monthly: the same page shows realised margin for the last 30 days.

Sources: [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) · [AI writing tools compared 2026 (eesel)](https://www.eesel.ai/blog/ai-writing-tools-comparison) · [Jasper pricing 2026 (layer3labs)](https://www.layer3labs.io/guides/jasper-ai-pricing) · [AI writing pricing 2026 (SaaS Dealer)](https://www.saasdealer.com/blog/ai-writing-pricing) · [LLM API pricing 2026 (IntuitionLabs)](https://intuitionlabs.ai/articles/llm-api-pricing-comparison-2025)
