import { CONFIG } from './config.js';

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const round1 = (n) => Math.round(n * 10) / 10;

export const isFestival = (asOf, cfg = CONFIG) => cfg.festivalMonths.includes(new Date(asOf).getUTCMonth() + 1);

/**
 * Raghav's documented rules for one SKU. Pure and deterministic.
 * weeklySales: units per week, oldest -> newest, ending the week before asOf.
 * Returns an action, the numbers behind it, and a plain-English reason.
 */
export function evaluateSku({ sku, weeklySales, onHand, onOrder = 0, asOf, festival: festivalOverride }, cfg = CONFIG) {
  const base = { sku_id: sku.sku_id, name: sku.name, perishable: !!sku.perishable, on_hand: onHand, on_order: onOrder };
  const review = (reason, flags) => ({ ...base, action: 'NEEDS_REVIEW', recommended_qty: 0, flags, reason });

  if (weeklySales.length < cfg.minHistoryWeeks) {
    return review(`Only ${weeklySales.length} weeks of history - new launch, outside documented rules`, ['NEW_LAUNCH']);
  }
  const recentAvg = mean(weeklySales.slice(-cfg.recentWeeks));
  const baselineAvg = mean(weeklySales.slice(-cfg.baselineWeeks));
  if (baselineAvg <= 0) return review('No sales in the last 12 weeks', ['NO_DEMAND']);

  // Festival uplift applies to the demand we plan against (cover calculation),
  // not to the spike test, which compares like with like.
  const festival = festivalOverride ?? isFestival(asOf, cfg); // calendar.csv wins when supplied
  const plannedWeekly = baselineAvg * (festival ? 1 + cfg.festivalUplift : 1);
  const cover = onHand / plannedWeekly;
  const coverWithPo = (onHand + onOrder) / plannedWeekly;
  const spikePct = recentAvg / baselineAvg - 1;
  const { minCoverWeeks, maxCoverWeeks } = sku.perishable ? cfg.perishable : cfg.standard;

  const isSpike = spikePct > cfg.spikeThreshold;
  const isStockout = cover < minCoverWeeks;
  const isOverstock = cover > maxCoverWeeks;
  const flags = [];
  if (festival) flags.push('FESTIVAL_UPLIFT');
  if (isSpike) flags.push('HIGH_DEMAND');
  if (isStockout) flags.push('STOCKOUT_RISK');
  if (isOverstock) flags.push('OVERSTOCK_RISK');

  const out = {
    ...base,
    avg_weekly_12w: Math.round(baselineAvg),
    recent_avg_4w: Math.round(recentAvg),
    spike_pct: round1(spikePct * 100),
    cover_weeks: round1(cover),
    min_cover: minCoverWeeks,
    max_cover: maxCoverWeeks,
    flags,
  };
  const qty = (mult) => Math.round(sku.std_order_qty * mult);
  const band = `${out.cover_weeks}w cover vs ${minCoverWeeks}-${maxCoverWeeks}w band`;

  if (isStockout) {
    if (coverWithPo >= minCoverWeeks) {
      return {
        ...out, action: 'ON_ORDER', recommended_qty: 0, flags: [...flags, 'OPEN_PO_COVERS'],
        reason: `Stockout risk (${band}) but open PO brings cover to ${round1(coverWithPo)}w`,
      };
    }
    const m = isSpike ? cfg.spikeQtyMultiplier : 1;
    return {
      ...out, action: 'REORDER_NOW', recommended_qty: qty(m),
      reason: `Stockout risk (${band})${isSpike ? `, demand up ${out.spike_pct}% - ${m}x quantity` : ''}`,
    };
  }
  if (isOverstock) {
    return {
      ...out, action: 'PAUSE_ORDER', recommended_qty: 0,
      flags: isSpike ? [...flags, 'RULE_CONFLICT'] : flags,
      reason: `Overstock (${band})${isSpike ? `, but demand is up ${out.spike_pct}% - rules disagree, planner to confirm` : ''}`,
    };
  }
  if (isSpike) {
    return {
      ...out, action: 'REORDER_HIGH_DEMAND', recommended_qty: qty(cfg.spikeQtyMultiplier),
      reason: `Last 4 weeks ${out.spike_pct}% above 12-week average - ${cfg.spikeQtyMultiplier}x standard quantity`,
    };
  }
  return { ...out, action: 'NO_ACTION', recommended_qty: 0, reason: `Within band (${band})` };
}
