import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSku } from '../src/rules.js';

const sku = { sku_id: 'T1', name: 'Test', perishable: 0, std_order_qty: 1000 };
const flat = (n, v = 100) => Array(n).fill(v);
const run = (o) => evaluateSku({ sku, weeklySales: flat(12), onHand: 800, asOf: '2026-07-06', ...o });

test('within band -> no action', () => assert.equal(run({}).action, 'NO_ACTION')); // 8w cover
test('below 6 weeks -> reorder now', () => assert.equal(run({ onHand: 500 }).action, 'REORDER_NOW'));
test('above 14 weeks -> pause', () => assert.equal(run({ onHand: 1500 }).action, 'PAUSE_ORDER'));
test('spike > 20% -> 1.5x reorder', () => {
  const r = run({ weeklySales: [...flat(8), ...flat(4, 150)] }); // 4w avg 150 vs 12w avg 116.7 = +28.6%
  assert.equal(r.action, 'REORDER_HIGH_DEMAND');
  assert.equal(r.recommended_qty, 1500);
});
test('spike exactly at 20% is not flagged', () => {
  const r = run({ weeklySales: [...flat(8, 90), ...flat(4, 120)], onHand: 700 }); // 12w avg 100, recent 120 = +20%
  assert.notEqual(r.action, 'REORDER_HIGH_DEMAND');
});
test('stockout + spike -> reorder 1.5x immediately', () => {
  const r = run({ weeklySales: [...flat(8), ...flat(4, 150)], onHand: 400 });
  assert.equal(r.action, 'REORDER_NOW');
  assert.equal(r.recommended_qty, 1500);
});
test('festival uplift pushes borderline stock into stockout risk', () => {
  assert.equal(run({ onHand: 650 }).action, 'NO_ACTION'); // 6.5w
  assert.equal(run({ onHand: 650, asOf: '2026-10-19' }).action, 'REORDER_NOW'); // 650/125 = 5.2w
});
test('perishable uses 3-4 week window', () => {
  const p = { ...sku, perishable: 1 };
  const r = (onHand) => evaluateSku({ sku: p, weeklySales: flat(12), onHand, asOf: '2026-07-06' });
  assert.equal(r(350).action, 'NO_ACTION');
  assert.equal(r(250).action, 'REORDER_NOW');
  assert.equal(r(450).action, 'PAUSE_ORDER');
});
test('open PO covering the gap downgrades to ON_ORDER', () => assert.equal(run({ onHand: 400, onOrder: 1000 }).action, 'ON_ORDER'));
test('new launch routes to a human', () => assert.equal(run({ weeklySales: flat(5) }).action, 'NEEDS_REVIEW'));
test('spike + overstock is flagged as a rule conflict', () => {
  const r = run({ weeklySales: [...flat(8), ...flat(4, 150)], onHand: 2000 });
  assert.equal(r.action, 'PAUSE_ORDER');
  assert.ok(r.flags.includes('RULE_CONFLICT'));
});
