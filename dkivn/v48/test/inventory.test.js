import test from 'node:test';
import assert from 'node:assert/strict';
import { inventorySnapshot, inventoryPolicy } from '../src/inventory.js';

const cfg = { softInventoryUsdt: 10, hardInventoryUsdt: 20 };

test('long inventory makes buy side less aggressive', () => {
  const p = inventoryPolicy({ netInventoryNotional: 12 }, cfg);
  assert.ok(p.bidSkewBps > 0);
  assert.ok(p.askSkewBps < 0);
});

test('hard long inventory disables inventory-adding buy side', () => {
  const p = inventoryPolicy({ netInventoryNotional: 20 }, cfg);
  assert.equal(p.allowBid, false);
  assert.equal(p.allowAsk, true);
});

test('inventory snapshot separates long and short notionals', () => {
  const s = inventorySnapshot([
    { side: 'LONG', positionValue: '12.5', avgPrice: '100' },
    { side: 'SHORT', positionValue: '3.5', avgPrice: '102' },
  ]);
  assert.equal(s.longInventoryNotional, 12.5);
  assert.equal(s.shortInventoryNotional, 3.5);
  assert.equal(s.netInventoryNotional, 9);
  assert.equal(s.grossInventoryNotional, 16);
});
