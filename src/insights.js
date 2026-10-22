// Prompt building and response validation for the LLM layer. Pure, so it is unit-tested
// without a network. The model explains; it never decides quantities.

export const SYSTEM = `You are a planning assistant for Freshroots, an FMCG distributor in Maharashtra and Goa.
A deterministic rules engine has already decided every action and quantity. Your job is to help the demand planner
understand and double-check those decisions in plain, concise language.

Hard rules:
- Use only the numbers in the data you are given. Never invent figures, causes, customers or events.
- Never recommend a quantity or action different from the engine's. If you doubt one, say what the planner should check.
- Reply with a single JSON object and nothing else, in exactly this shape:
{"summary":"<one sentence headline>","bullets":[{"tone":"urgent|watch|info","sku_id":"<id or null>","text":"<max 30 words>"}],"sku_notes":{"<sku_id>":"<max 30 words: what to check before accepting>"}}
- 3 to 5 bullets, most important first. Add sku_notes only for SKUs that deserve a human look: rule conflicts, borderline cover (within 10% of a band edge), new launches, or demand moving against the stock position.`;

export function buildUserPrompt(asOf, festival, recs, sales) {
  const rows = recs.map((r) => ({
    sku_id: r.sku_id,
    name: r.name.replace('Freshroots ', ''),
    perishable: r.perishable,
    action: r.action,
    recommended_qty: r.recommended_qty,
    on_hand: r.on_hand,
    cover_weeks: r.cover_weeks ?? null,
    target_band_weeks: r.min_cover ? [r.min_cover, r.max_cover] : null,
    last4_vs_12w_pct: r.spike_pct ?? null,
    flags: r.flags,
    weekly_sales_oldest_to_newest: sales[r.sku_id] || [],
  }));
  return `Planning run as of ${asOf}. Festival month (25% demand uplift applied to cover): ${festival}.
Cover is on-hand stock divided by planned weekly sales.\n\nSKU data:\n${JSON.stringify(rows)}`;
}

// Extracts and validates the model's JSON. Throws on anything unusable so a bad
// response never reaches the dashboard.
export function parseInsights(text, validSkuIds) {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object in model response');
  const raw = JSON.parse(text.slice(start, end + 1));
  const ids = new Set(validSkuIds);
  const clean = (s) => String(s).replace(/\s+/g, ' ').trim().slice(0, 400);

  if (typeof raw.summary !== 'string' || !raw.summary.trim()) throw new Error('Missing summary');
  const bullets = (Array.isArray(raw.bullets) ? raw.bullets : [])
    .filter((b) => b && typeof b.text === 'string' && b.text.trim())
    .map((b) => ({
      tone: ['urgent', 'watch', 'info'].includes(b.tone) ? b.tone : 'info',
      sku_id: ids.has(b.sku_id) ? b.sku_id : null,
      text: clean(b.text),
    }))
    .slice(0, 5);
  if (!bullets.length) throw new Error('No usable bullets');

  const sku_notes = {};
  for (const [id, note] of Object.entries(raw.sku_notes && typeof raw.sku_notes === 'object' ? raw.sku_notes : {})) {
    if (ids.has(id) && typeof note === 'string' && note.trim()) sku_notes[id] = clean(note);
  }
  return { summary: clean(raw.summary), bullets, sku_notes };
}
