import { readCsv } from './csv.js';

const IN = 'data/input';

// 2026-W42 -> ISO date of that week's Monday
export function isoWeekMonday(label) {
  const [y, w] = label.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday1 = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 864e5;
  return new Date(monday1 + (w - 1) * 7 * 864e5).toISOString().slice(0, 10);
}

export function loadData() {
  const skus = readCsv(`${IN}/sku_master.csv`).map((s) => ({
    sku_id: s.SKU_ID,
    name: s.SKU_Name,
    category: s.Category,
    perishable: s.Perishability.toLowerCase() === 'high',
    std_order_qty: +s.Standard_Reorder_Qty,
    distributor_id: s.Distributor_ID,
  }));
  const distributors = new Map(readCsv(`${IN}/distributor_master.csv`).map((d) => [d.Distributor_ID, d]));
  const calendar = new Map(readCsv(`${IN}/calendar.csv`).map((c) => [c.Year_Month, c.Is_Festival_Month.toUpperCase() === 'TRUE']));

  // One warehouse location in the current file; sum if more are added.
  const inventory = readCsv(`${IN}/current_inventory.csv`);
  const asOf = inventory[0].As_Of_Date;
  const onHand = new Map();
  for (const r of inventory) onHand.set(r.SKU_ID, (onHand.get(r.SKU_ID) || 0) + +r.Units_On_Hand);

  // Weeks are zero-padded, so a plain string sort is chronological.
  const history = new Map();
  for (const r of readCsv(`${IN}/weekly_sales.csv`)) {
    if (!history.has(r.SKU_ID)) history.set(r.SKU_ID, []);
    history.get(r.SKU_ID).push({ week: r.Week, units: +r.Units_Sold });
  }
  for (const h of history.values()) h.sort((a, b) => a.week.localeCompare(b.week));

  const isFestivalOn = (iso) => {
    const f = calendar.get(iso.slice(0, 7));
    if (f === undefined) throw new Error(`calendar.csv has no row for ${iso.slice(0, 7)}`);
    return f;
  };
  return { skus, distributors, asOf, onHand, history, isFestivalOn };
}
