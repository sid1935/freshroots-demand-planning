# Freshroots demand planning

Twice-weekly (or on demand) reorder recommendations for every SKU, built from Raghav's documented forecasting rules. Planners accept or override each recommendation on a dashboard; overrides are logged so the undocumented 15-20% of judgment calls gets written down over time.

## Run it

```
npm run all      # recommendations -> backtest -> dashboard
npm test         # unit tests for the rules
```

Open `output/dashboard.html`. Individual steps: `npm run run`, `npm run backtest`, `npm run report`.

Inputs live in `data/input/` (SKU master, distributor master, current inventory, weekly sales, calendar). Replace the files with fresh SAP exports and re-run. Thresholds are in `src/config.js`.

## Why demand planning first

| | Demand planning | Distributor service | Operations intelligence |
|---|---|---|---|
| Data exists | Yes: sales, stock, SKU master | No: WhatsApp is unarchived | Yes |
| Logic defined | Yes: 5 rules, ~80-85% coverage | No: query types never measured | Metrics defined, but who acts is not |
| Cost measurable | Rs 28-34 lakh per quarter | Anecdotes | One Rs 9 lakh incident |
| Bottleneck is technical | Mostly (manual data prep) | Needs a logging phase first | No: an ownership and process gap |
| Can be verified | Yes, by backtest | No baseline | Weakly |

Distributor service is the natural phase 2, after a few weeks of structured query logging. The 9-checks and Pre-Build Checklist were not in the case PDF, so this ranking uses the criteria above; map it onto the official checklist before submitting.

## The rules (src/rules.js)

1. Last 4 weeks more than 20% above the 12-week average: high demand, reorder 1.5x the standard quantity.
2. Stock below 6 weeks of average sales: stockout risk, reorder now.
3. Stock above 14 weeks: overstock risk, pause the next order.
4. October, November, March: 25% demand uplift.
5. Perishables (Perishability = High): 3 to 4 weeks of stock.

Pure, deterministic code, not an LLM: every recommendation is explainable and unit-tested. Anything outside the rules goes to a human: SKUs with under 12 weeks of history are `NEEDS_REVIEW`, and a spike together with overstock is flagged `RULE_CONFLICT`.

### Judgment calls to confirm with Raghav

- Festival uplift scales the demand used for the cover calculation, not the 4-week-vs-12-week spike test (avoids double counting).
- If open purchase orders restore the minimum cover, a stockout flag becomes `ON_ORDER`. No PO file was supplied, so this is currently inactive.
- `Standard_Reorder_Qty` is one standard order; the 1.5x multiplier applies to it.
- The 12-week average dilutes recent jumps (Mango Drink's real jump is about 35%, the rule sees 21%). A 4-week baseline might suit fast movers.

## Backtest (src/backtest.js)

Replays W35-W42 under two review cycles using the same rules: monthly (every 4 weeks, data 3 weeks stale) and weekly (fresh data). The monthly policy orders at least 4 weeks of demand so the comparison is fair.

| Lead time | Monthly units lost / fill | Weekly units lost / fill |
|---|---|---|
| 0 wk | 304 / 97.2% | 0 / 100% |
| 1 wk | 623 / 94.2% | 0 / 100% |
| 2 wk | 1,042 / 90.3% | 77 / 99.3% |

Directional, not a savings forecast. Limits: opening stock and lead time are assumed (no history supplied), observed sales stand in for demand, only 8 weeks are tested, results are in units not rupees, and weekly ordering holds more stock at zero lead time.

## Data gaps to close before go-live

- Purchase orders from Zoho (open quantity and expected date) so `ON_ORDER` works.
- Supplier lead time per SKU, so reorder timing reflects delivery delay.
- Unit price or margin, to express lost sales in rupees.
- Distributor-level sales if forecasts should reflect individual distributor behaviour.
- A longer sales history (the brief mentions 3 years; the sample has 16 weeks).

## Roadmap

1. Connect SAP and Zoho exports on a schedule, replacing the CSV drop.
2. Use the override log to find recurring patterns and turn them into rules.
3. LLM layer for the review queue only (new launches, rule conflicts): plain-language summaries and analogue-SKU suggestions, always shown as suggestions.
4. Alert the named planner when a SKU flips to stockout risk between runs.

## Shared storage (Supabase)

Planner decisions are saved to Supabase through `api/decisions.js` so they are shared and persistent. Run `supabase/schema.sql` once in the SQL editor, then set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and (recommended) `PLANNER_PASSCODE` as Vercel environment variables. The key never reaches the browser; with a passcode set, the dashboard asks for it once per browser. `npm run sync` saves each run's recommendations to the `recommendation_runs` table. Without the variables the dashboard falls back to browser storage.
