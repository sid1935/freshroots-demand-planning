import fs from 'node:fs';
import { writeCsv } from './csv.js';
import { CONFIG } from './config.js';
import { evaluateSku } from './rules.js';
import { loadData } from './load.js';

const { skus, distributors, asOf, onHand, history, isFestivalOn } = loadData();
const festival = isFestivalOn(asOf);

const recs = skus.map((sku) => {
  const weeks = history.get(sku.sku_id) || [];
  const r = evaluateSku({ sku, weeklySales: weeks.map((w) => w.units), onHand: onHand.get(sku.sku_id) ?? 0, asOf, festival }, CONFIG);
  const dist = distributors.get(sku.distributor_id);
  return { ...r, category: sku.category, distributor_id: sku.distributor_id, distributor: dist?.Distributor_Name ?? 'UNKNOWN', weeks_of_history: weeks.length };
});

const order = { NEEDS_REVIEW: 0, REORDER_NOW: 1, PAUSE_ORDER: 2, REORDER_HIGH_DEMAND: 3, ON_ORDER: 4, NO_ACTION: 5 };
recs.sort((a, b) => order[a.action] - order[b.action] || a.sku_id.localeCompare(b.sku_id));

fs.mkdirSync('output', { recursive: true });
fs.writeFileSync('output/recommendations.json', JSON.stringify({ as_of: asOf, festival, recommendations: recs }, null, 2));
writeCsv('output/recommendations.csv', recs.map((r) => ({ ...r, flags: r.flags.join('|') })));

console.log(`As of ${asOf} (festival month: ${festival}) - ${recs.length} SKUs, ${history.size} with sales history`);
console.table(
  recs.map((r) => ({
    sku: r.sku_id, name: r.name.replace('Freshroots ', ''), action: r.action, qty: r.recommended_qty,
    cover_w: r.cover_weeks, band: r.min_cover ? `${r.min_cover}-${r.max_cover}` : '-', spike_pct: r.spike_pct,
  })),
);
