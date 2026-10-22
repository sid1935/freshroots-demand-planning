// Replays the 16 weeks of sales under two review cycles, both using the SAME rules:
//   monthly - decide every 4 weeks, on data that is `lag` weeks old (the current process)
//   weekly  - decide every week on fresh data (what automated data prep makes possible)
// Compares units lost to stockouts and unit-weeks held above the overstock limit.
//
// Assumptions (no historical stock or PO data was supplied - see README):
//  - opening stock = middle of the SKU's cover band, identical for both policies
//  - an order placed in week t arrives at the start of week t + leadTime
//  - observed sales = demand (stockouts in the data would hide true demand)
import fs from 'node:fs';
import { CONFIG } from './config.js';
import { evaluateSku } from './rules.js';
import { loadData, isoWeekMonday } from './load.js';

const START = 8; // first simulated week index (8 weeks of history available)
const CYCLE = 4; // monthly review every 4 weeks
const LAG = 3; // weeks of staleness in the monthly process (brief: "3-4 weeks old")
const cfg = { ...CONFIG, minHistoryWeeks: 4 }; // short history: accept fewer than 12 weeks

const { skus, history, isFestivalOn } = loadData();
const weekLabels = [...new Set([...history.values()].flatMap((h) => h.map((w) => w.week)))].sort();
const N = weekLabels.length;
const monday = weekLabels.map(isoWeekMonday);

function simulate(policy, leadTime) {
  const totals = { lostUnits: 0, stockoutSkuWeeks: 0, overstockUnitWeeks: 0, orders: 0, unitsOrdered: 0, soldUnits: 0 };
  const perSku = [];

  for (const sku of skus) {
    const demand = history.get(sku.sku_id).map((w) => w.units);
    const band = sku.perishable ? cfg.perishable : cfg.standard;
    const openAvg = demand.slice(0, START).reduce((a, b) => a + b, 0) / START;
    let stock = Math.round(((band.minCoverWeeks + band.maxCoverWeeks) / 2) * openAvg);
    const stockAtStart = []; // stock at the start of each week, for stale views
    const arrivals = new Map();
    let lost = 0, soWeeks = 0, overUW = 0, orders = 0, ordered = 0, sold = 0;

    for (let t = START; t < N; t++) {
      stock += arrivals.get(t) || 0;
      stockAtStart[t] = stock;

      const reviewNow = policy === 'weekly' || (t - START) % CYCLE === 0;
      if (reviewNow) {
        const lag = policy === 'weekly' ? 0 : LAG;
        const viewT = t - lag; // data cut-off: sales before viewT, stock as of viewT
        const viewStock = lag === 0 ? stock : (stockAtStart[viewT] ?? stock);
        const inPipe = [...arrivals.entries()].filter(([k]) => k >= t).reduce((a, [, q]) => a + q, 0);
        const r = evaluateSku(
          { sku, weeklySales: demand.slice(0, viewT), onHand: viewStock, onOrder: inPipe, asOf: monday[t], festival: isFestivalOn(monday[t]) },
          cfg,
        );
        if (r.recommended_qty > 0) {
          // A monthly order has to last until the next review, so it is at least
          // CYCLE weeks of planned demand; the weekly policy keeps the rule quantity.
          const planned = r.avg_weekly_12w * (r.flags.includes('FESTIVAL_UPLIFT') ? 1 + cfg.festivalUplift : 1);
          const qty = policy === 'monthly' ? Math.max(r.recommended_qty, Math.ceil(planned * CYCLE)) : r.recommended_qty;
          const arrive = t + leadTime;
          arrivals.set(arrive, (arrivals.get(arrive) || 0) + qty);
          orders++; ordered += qty;
          if (leadTime === 0) { stock += qty; arrivals.delete(arrive); }
        }
      }

      const s = Math.min(stock, demand[t]);
      sold += s;
      if (demand[t] > s) { lost += demand[t] - s; soWeeks++; }
      stock -= s;
      const avg = demand.slice(Math.max(0, t - 11), t + 1).reduce((a, b) => a + b, 0) / Math.min(12, t + 1);
      const over = stock - band.maxCoverWeeks * avg;
      if (over > 0) overUW += over;
    }
    perSku.push({ sku_id: sku.sku_id, lost, soWeeks, overUW: Math.round(overUW), orders });
    totals.lostUnits += lost; totals.stockoutSkuWeeks += soWeeks; totals.overstockUnitWeeks += overUW;
    totals.orders += orders; totals.unitsOrdered += ordered; totals.soldUnits += sold;
  }
  totals.overstockUnitWeeks = Math.round(totals.overstockUnitWeeks);
  return { totals, perSku };
}

const out = { window: `${weekLabels[START]} to ${weekLabels[N - 1]}`, weeks: N - START, lag: LAG, results: [] };
const rows = [];
for (const lead of [0, 1, 2]) {
  const m = simulate('monthly', lead);
  const w = simulate('weekly', lead);
  const fillM = m.totals.soldUnits / (m.totals.soldUnits + m.totals.lostUnits);
  const fillW = w.totals.soldUnits / (w.totals.soldUnits + w.totals.lostUnits);
  out.results.push({ leadTimeWeeks: lead, monthly: m.totals, weekly: w.totals, perSkuWeekly: w.perSku, perSkuMonthly: m.perSku });
  rows.push(
    { lead_wks: lead, policy: 'monthly', lost_units: m.totals.lostUnits, stockout_sku_wks: m.totals.stockoutSkuWeeks, overstock_unit_wks: m.totals.overstockUnitWeeks, orders: m.totals.orders, units_ordered: m.totals.unitsOrdered, fill_rate: (fillM * 100).toFixed(1) + '%' },
    { lead_wks: lead, policy: 'weekly', lost_units: w.totals.lostUnits, stockout_sku_wks: w.totals.stockoutSkuWeeks, overstock_unit_wks: w.totals.overstockUnitWeeks, orders: w.totals.orders, units_ordered: w.totals.unitsOrdered, fill_rate: (fillW * 100).toFixed(1) + '%' },
  );
}

fs.mkdirSync('output', { recursive: true });
fs.writeFileSync('output/backtest.json', JSON.stringify(out, null, 2));
console.log(`Backtest ${out.window} (${out.weeks} weeks, ${skus.length} SKUs). Monthly view is ${LAG} weeks stale.`);
console.table(rows);
