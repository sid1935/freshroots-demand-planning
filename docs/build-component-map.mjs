// Generates docs/Components_Map_Freshroots_Demand_Planning.html (one landscape page).
// Export to PDF with Chrome headless (see README in this folder's header comment below).
//   node docs/build-component-map.mjs
//   chrome --headless --print-to-pdf=docs/Components_Map_Freshroots_Demand_Planning.pdf --no-pdf-header-footer <html>
import fs from 'node:fs';

const W = 1200, H = 800;
const LABEL_W = 150, X0 = 28 + LABEL_W, CW = (W - 28 - X0) / 6;
const TOP = 128, HEAD = 22, RH = 54, BW = 138, BH = 44;
const COLS = ['TRIGGER', 'INPUT', 'CONTEXT', 'PROCESSING', 'AI', 'OUTPUT'];

const rows = [
  { name: 'Trigger', sub: 'manual run today' },
  { name: 'SAP exports', sub: '5 CSV files, no PO file yet' },
  { name: 'Thresholds + calendar', sub: 'config.js, editable' },
  { name: 'Rules engine', sub: 'rules.js, deterministic' },
  { name: 'Backtest', sub: 'backtest.js' },
  { name: 'Gemini', sub: 'the AI step' },
  { name: 'Dashboard', sub: 'Vercel static page' },
  { name: 'Planner review', sub: 'human gate', human: true },
  { name: 'Supabase + API', sub: 'state, log, reporting' },
];

// kind: ok (green) | ai (blue) | out (tan) | human (orange)
const boxes = [
  { r: 0, c: 0, kind: 'ok', lines: ['Run now: npm run all:ai.', 'Twice-weekly cron is planned,', 'not yet scheduled'] },
  { r: 1, c: 1, kind: 'ok', lines: ['SKU master, 16 weeks of', 'sales, stock on hand,', 'calendar, distributors'] },
  { r: 2, c: 2, kind: 'ok', lines: ['20% spike, 6-14 wk cover,', '3-4 wk perishables, +25%', 'uplift in Oct, Nov, Mar'] },
  { r: 3, c: 3, kind: 'ok', lines: ['Cover, spike, festival uplift;', 'picks action + quantity.', 'New launches go to review'] },
  { r: 4, c: 3, kind: 'ok', lines: ['Replays W35-W42: monthly', 'fill 90-97% vs weekly', '99-100%'] },
  { r: 5, c: 4, kind: 'ai', lines: ['Explains the output: headline,', 'bullets, AI check notes.', 'Never sets a quantity'] },
  { r: 6, c: 5, kind: 'out', lines: ['KPI cards, charts, table,', 'draft purchase orders,', 'AI summary'] },
  { r: 7, c: 5, kind: 'human', lines: ['Planner accepts or overrides', 'each SKU, with a reason.', 'Nothing orders itself'] },
  { r: 8, c: 5, kind: 'out', lines: ['Decisions and each run saved;', 'passcode-protected API'] },
];

const STYLE = {
  ok: ['#e4f1e8', '#2f6b4a', 1.1],
  ai: ['#e6eefc', '#2f6bd0', 1.8],
  out: ['#f2ece1', '#8a7a60', 1.1],
  human: ['#fdebc6', '#e0961a', 1.8],
};

const rowY = (r) => TOP + HEAD + r * RH;
const geo = (b) => {
  const x = X0 + b.c * CW + (CW - BW) / 2, y = rowY(b.r) + (RH - BH) / 2;
  return { x, y, w: BW, h: BH, cx: x + BW / 2, cy: y + BH / 2, right: x + BW, bottom: y + BH };
};
const G = boxes.map(geo);
const by = (r, c) => G[boxes.findIndex((b) => b.r === r && b.c === c)];

let svg = '';
// column headers
COLS.forEach((c, i) => {
  svg += `<rect x="${X0 + i * CW}" y="${TOP}" width="${CW}" height="${HEAD}" fill="${c === 'AI' ? '#2f6bd0' : '#2d5a47'}"/>`
    + `<text x="${X0 + i * CW + CW / 2}" y="${TOP + 15}" text-anchor="middle" class="colh">${c}</text>`;
});
svg += `<rect x="28" y="${TOP}" width="${LABEL_W}" height="${HEAD}" fill="#2d5a47"/><text x="36" y="${TOP + 15}" class="colh" style="text-anchor:start">COMPONENT</text>`;
// rows
rows.forEach((row, i) => {
  const y = rowY(i);
  svg += `<line x1="28" x2="${W - 28}" y1="${y + RH}" y2="${y + RH}" stroke="#d9dcd6" stroke-width=".8"/>`;
  if (row.human) svg += `<rect x="28" y="${y + 1}" width="${W - 56}" height="${RH - 2}" fill="#fff8e8"/>`;
  svg += `<text x="34" y="${y + 24}" class="rname" ${row.human ? 'fill="#c9780a"' : ''}>${row.name}</text>`
    + (row.human ? `<text x="34" y="${y + 37}" class="human">HUMAN GATE</text>` : `<text x="34" y="${y + 37}" class="rsub">${row.sub}</text>`);
});
// column guide lines
for (let i = 1; i < 6; i++) svg += `<line x1="${X0 + i * CW}" x2="${X0 + i * CW}" y1="${TOP + HEAD}" y2="${rowY(rows.length)}" stroke="#e6e8e3" stroke-width=".6"/>`;

// connectors (drawn before boxes so boxes sit on top)
const arrow = (pts, { dashed = false, label, dot } = {}) => {
  svg += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#1d1d1d" stroke-width="1.3" ${dashed ? 'stroke-dasharray="4 3"' : ''} marker-end="url(#ah)"/>`;
  if (label) svg += `<text x="${label.x}" y="${label.y}" class="alab" ${label.anchor ? `text-anchor="${label.anchor}"` : ''}>${label.t}</text>`;
  if (dot) svg += `<circle cx="${dot[0]}" cy="${dot[1]}" r="3.6" fill="#7a2fd0" stroke="#fff" stroke-width="1"/>`;
};
const elbow = (a, b, tx = b.cx) => [[a.right, a.cy], [tx, a.cy], [tx, b.y]];
const vert = (a, b, x = a.cx) => [[x, a.bottom], [x, b.y]];

arrow(elbow(by(0, 0), by(1, 1)), { label: { x: by(0, 0).right + 4, y: by(0, 0).cy - 4, t: 'read files' } });
arrow(elbow(by(1, 1), by(2, 2)));
arrow(elbow(by(2, 2), by(3, 3)));
arrow(vert(by(3, 3), by(4, 3)), { label: { x: by(3, 3).cx + 6, y: by(3, 3).bottom + 8, t: 'same rules' } });
arrow(elbow(by(3, 3), by(5, 4)), { label: { x: by(3, 3).right + 4, y: by(3, 3).cy - 4, t: 'recommendations' } });
arrow(elbow(by(5, 4), by(6, 5), by(6, 5).cx + 30), { label: { x: by(5, 4).right + 4, y: by(5, 4).cy - 4, t: 'insights' } });
arrow(elbow(by(4, 3), by(6, 5), by(6, 5).cx - 36), { dashed: true, label: { x: by(4, 3).right + 4, y: by(4, 3).cy - 4, t: 'results' } });
arrow(vert(by(6, 5), by(7, 5)), { dot: [by(6, 5).cx, (by(6, 5).bottom + by(7, 5).y) / 2], label: { x: by(6, 5).cx + 8, y: (by(6, 5).bottom + by(7, 5).y) / 2 + 3, t: 'planner reads it' } });
arrow(vert(by(7, 5), by(8, 5)), { dot: [by(7, 5).cx, (by(7, 5).bottom + by(8, 5).y) / 2], label: { x: by(7, 5).cx + 8, y: (by(7, 5).bottom + by(8, 5).y) / 2 + 3, t: 'decisions' } });

// boxes
boxes.forEach((b, i) => {
  const g = G[i], [fill, stroke, sw] = STYLE[b.kind];
  svg += `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  const n = b.lines.length, lh = 10.2, y0 = g.cy - ((n - 1) * lh) / 2 + 3;
  b.lines.forEach((t, k) => { svg += `<text x="${g.cx}" y="${y0 + k * lh}" text-anchor="middle" class="bt">${t}</text>`; });
});

const callouts = [
  ['Recommend only, a human orders', 'The rules engine and Gemini never place an order. Every quantity is a suggestion until the planner clicks Accept or Override. Accepted quantities roll up into draft purchase orders by distributor.'],
  ['Numbers from rules, words from AI', 'Actions and quantities come from the five documented rules and are covered by 16 unit tests. Gemini only explains them, and its reply is validated before it reaches the page. It cannot change a number.'],
  ['Outside the rules goes to a person', 'SKUs with under 12 weeks of history and spike-versus-overstock conflicts are flagged for review. Every override is logged with a reason, which is how the undocumented 15-20% of judgment gets written down.'],
];

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Components Map: Freshroots Demand Planning</title>
<style>
@page{size:${W}px ${H}px;margin:0}
*{box-sizing:border-box}html,body{margin:0;background:#fff}
body{width:${W}px;height:${H}px;position:relative;font-family:"Helvetica Neue",Arial,sans-serif;color:#151515;overflow:hidden}
.tag{position:absolute;left:28px;top:20px;font-size:9px;color:#6b6b6b;letter-spacing:.02em}
h1{position:absolute;left:28px;top:36px;margin:0;font-size:24px;letter-spacing:-.01em}
.sub{position:absolute;left:28px;top:72px;font-size:11px;color:#444;margin:0}
.legend{position:absolute;right:28px;top:26px;display:flex;gap:16px;font-size:9px;color:#444;align-items:center}
.legend i{display:inline-block;vertical-align:middle;margin-right:5px}
.legend .ar{width:24px;border-top:1.3px solid #1d1d1d;position:relative}
.legend .dt{width:8px;height:8px;border-radius:50%;background:#7a2fd0}
.legend .hg{width:16px;height:10px;border:1.8px solid #e0961a;background:#fdebc6;border-radius:3px}
svg{position:absolute;left:0;top:0}
svg text{font-family:"Helvetica Neue",Arial,sans-serif}
.colh{fill:#fff;font-size:9.5px;font-weight:700;letter-spacing:.06em}
.rname{font-size:11px;font-weight:700;fill:#151515}.rsub{font-size:8.5px;fill:#777}
.bt{font-size:8.1px;fill:#1c1c1c}.alab{font-size:7.5px;fill:#555;font-style:italic}.human{font-size:7.5px;font-weight:700;fill:#c9780a;letter-spacing:.06em}
.callouts{position:absolute;left:28px;right:28px;top:${rowY(rows.length) + 26}px;display:grid;grid-template-columns:repeat(3,1fr);gap:26px}
.callouts div{border-top:2px solid #2d5a47;padding-top:7px}
.callouts b{display:block;font-size:11px;margin-bottom:4px}
.callouts p{margin:0;font-size:9.4px;line-height:1.45;color:#333}
.foot{position:absolute;left:28px;bottom:14px;font-size:8px;color:#888}
</style></head><body>
<div class="tag">MESA · AI-Native Track · Term 2 Case Study · Final Submission</div>
<h1>Components Map: Freshroots Demand Planning / Deepa (operations)</h1>
<p class="sub">Demand planning first, from three candidate areas. Trigger → Input → Context → Processing → AI → Output, as built.</p>
<div class="legend"><span><i class="ar"></i>flow</span><span><i class="dt"></i>handoff between actors</span><span><i class="hg"></i>human gate</span></div>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#1d1d1d"/></marker></defs>${svg}</svg>
<div class="callouts">${callouts.map(([t, p]) => `<div><b>${t}</b><p>${p}</p></div>`).join('')}</div>
<div class="foot">github.com/sid1935/freshroots-demand-planning · live: freshroots-demand-planning-weld.vercel.app</div>
</body></html>`;

fs.writeFileSync('docs/Components_Map_Freshroots_Demand_Planning.html', html);
console.log('Wrote docs/Components_Map_Freshroots_Demand_Planning.html');
