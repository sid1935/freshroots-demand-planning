// Adds LLM-written explanations to the dashboard. Reads output/recommendations.json,
// calls Gemini (or Anthropic), writes output/insights.json (then run `npm run report`).
// The key is read from .env; it never goes into the dashboard.
import fs from 'node:fs';
import { loadData } from './load.js';
import { SYSTEM, buildUserPrompt, parseInsights } from './insights.js';

try { process.loadEnvFile('.env'); } catch { /* .env is optional; the variable may already be set */ }

const gemini = process.env.GEMINI_API_KEY, anthropic = process.env.ANTHROPIC_API_KEY;
if (!gemini && !anthropic) {
  console.error('No API key set. Copy .env.example to .env and add GEMINI_API_KEY or ANTHROPIC_API_KEY.');
  process.exit(1);
}
const provider = gemini ? 'gemini' : 'anthropic';
const model = gemini ? process.env.GEMINI_MODEL || 'gemini-3.8-flash' : process.env.LLM_MODEL || 'claude-haiku-5-5';

const rec = JSON.parse(fs.readFileSync('output/recommendations.json', 'utf8'));
const { history } = loadData();
const sales = Object.fromEntries([...history].map(([id, h]) => [id, h.map((w) => w.units)]));
const prompt = buildUserPrompt(rec.as_of, rec.festival, rec.recommendations, sales);

const requests = {
  gemini: () => ({
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    headers: { 'x-goog-api-key': gemini, 'content-type': 'application/json' },
    body: {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 4000, thinkingConfig: { thinkingBudget: 0 } },
    },
    text: (j) => {
      const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      if (!text) throw new Error(`Gemini returned no text (finishReason: ${j.candidates?.[0]?.finishReason ?? j.promptFeedback?.blockReason ?? 'unknown'})`);
      return text;
    },
  }),
  anthropic: () => ({
    url: 'https://api.anthropic.com/v1/messages',
    headers: { 'x-api-key': anthropic, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: { model, max_tokens: 1500, system: SYSTEM, messages: [{ role: 'user', content: prompt }] },
    text: (j) => j.content.filter((b) => b.type === 'text').map((b) => b.text).join(''),
  }),
};

async function call() {
  const r = requests[provider]();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(r.url, { method: 'POST', headers: r.headers, body: JSON.stringify(r.body), signal: AbortSignal.timeout(60_000) });
    if (res.ok) return r.text(await res.json());
    const retryable = res.status === 429 || res.status >= 500;
    const body = (await res.text()).slice(0, 300);
    if (!retryable || attempt === 3) throw new Error(`${provider} API ${res.status}: ${body}`);
    await new Promise((s) => setTimeout(s, attempt * 2000));
  }
}

const insights = parseInsights(await call(), rec.recommendations.map((r) => r.sku_id));
fs.writeFileSync('output/insights.json', JSON.stringify({ as_of: rec.as_of, model, generated_at: new Date().toISOString(), ...insights }, null, 2));
console.log(`Wrote output/insights.json (${provider}, ${model}): ${insights.bullets.length} bullets, ${Object.keys(insights.sku_notes).length} SKU notes`);
console.log(insights.summary);
