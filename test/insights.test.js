import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInsights, buildUserPrompt } from '../src/insights.js';

const ids = ['SKU001', 'SKU002'];

test('parses JSON wrapped in prose or code fences', () => {
  const text = 'Here you go:\n```json\n{"summary":"Two SKUs need action.","bullets":[{"tone":"urgent","sku_id":"SKU001","text":"Reorder."}],"sku_notes":{"SKU002":"Check lead time."}}\n```';
  const r = parseInsights(text, ids);
  assert.equal(r.summary, 'Two SKUs need action.');
  assert.equal(r.bullets[0].sku_id, 'SKU001');
  assert.equal(r.sku_notes.SKU002, 'Check lead time.');
});

test('drops unknown SKU ids and invalid tones', () => {
  const r = parseInsights('{"summary":"s","bullets":[{"tone":"loud","sku_id":"SKU999","text":"x"}],"sku_notes":{"SKU999":"nope","SKU001":"ok"}}', ids);
  assert.equal(r.bullets[0].tone, 'info');
  assert.equal(r.bullets[0].sku_id, null);
  assert.deepEqual(Object.keys(r.sku_notes), ['SKU001']);
});

test('caps bullets at five', () => {
  const b = Array.from({ length: 9 }, (_, i) => ({ tone: 'info', text: `b${i}` }));
  assert.equal(parseInsights(JSON.stringify({ summary: 's', bullets: b }), ids).bullets.length, 5);
});

test('rejects unusable responses', () => {
  assert.throws(() => parseInsights('I cannot help', ids));
  assert.throws(() => parseInsights('{"summary":"","bullets":[]}', ids));
  assert.throws(() => parseInsights('{"summary":"s","bullets":[]}', ids));
});

test('prompt carries SKU data and the festival flag', () => {
  const p = buildUserPrompt('2026-10-19', true, [{ sku_id: 'SKU001', name: 'Freshroots Mango', perishable: false, action: 'REORDER_NOW', recommended_qty: 750, on_hand: 900, cover_weeks: 3.4, min_cover: 6, max_cover: 14, spike_pct: 21.4, flags: [] }], { SKU001: [1, 2, 3] });
  assert.match(p, /"sku_id":"SKU001"/);
  assert.match(p, /Festival month.*true/);
  assert.match(p, /\[1,2,3\]/);
});
