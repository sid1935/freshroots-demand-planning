// Builds output/dashboard.html: a self-contained planner dashboard.
// Run `npm run run` and `npm run backtest` first (this reads their JSON output).
import fs from 'node:fs';
import { loadData, isoWeekMonday } from './load.js';

const rec = JSON.parse(fs.readFileSync('output/recommendations.json', 'utf8'));
const bt = fs.existsSync('output/backtest.json') ? JSON.parse(fs.readFileSync('output/backtest.json', 'utf8')) : null;
const { history, isFestivalOn } = loadData();

const labels = [...new Set([...history.values()].flatMap((h) => h.map((w) => w.week)))].sort();
const weeks = labels.map((label) => ({ label, festival: isFestivalOn(isoWeekMonday(label)) }));
const sales = {};
for (const [sku, h] of history) {
  const byWeek = new Map(h.map((w) => [w.week, w.units]));
  sales[sku] = labels.map((l) => byWeek.get(l) ?? 0);
}

const backtest = bt && {
  window: bt.window,
  weeks: bt.weeks,
  lag: bt.lag,
  rows: bt.results.map((r) => ({ lead: r.leadTimeWeeks, m: r.monthly, w: r.weekly })),
};
// LLM insights are optional, and ignored if they were generated for a different run.
let insights = fs.existsSync('output/insights.json') ? JSON.parse(fs.readFileSync('output/insights.json', 'utf8')) : null;
if (insights && insights.as_of !== rec.as_of) insights = null;

const data = JSON.stringify({ asOf: rec.as_of, festival: rec.festival, recs: rec.recommendations, weeks, sales, backtest, llm: insights }).replace(/</g, '\\u003c');

const template = fs.readFileSync(new URL('./dashboard.template.html', import.meta.url), 'utf8');
const html = template.replace('__DATA__', () => data);
fs.writeFileSync('output/dashboard.html', html);
// public/index.html is what gets deployed (Vercel serves ./public as a static site)
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/index.html', html);
console.log('Wrote output/dashboard.html and public/index.html');
