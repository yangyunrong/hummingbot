import test from 'node:test';
import assert from 'node:assert/strict';
import { inventorySnapshot, inventoryPolicy } from '../src/inventory.js';

const cfg = { softInventoryUsdt: 10, hardInventoryUsdt: 20, maxLeverageForDualSide: 20 };

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
    { side: 'LONG', positionValue: '12.5', avgPrice: '100', leverage: '10' },
    { side: 'SHORT', positionValue: '3.5', avgPrice: '102', leverage: '5' },
  ]);
  assert.equal(s.longInventoryNotional, 12.5);
  assert.equal(s.shortInventoryNotional, 3.5);
  assert.equal(s.netInventoryNotional, 9);
  assert.equal(s.grossInventoryNotional, 16);
  assert.equal(s.maxLeverage, 10);
});

test('high leverage existing long switches policy to reduce-only ask', () => {
  const s = inventorySnapshot([
    { side: 'LONG', positionValue: '7.94', position: '0.0001', avgPrice: '79369.9', leverage: '50' },
  ]);
  const p = inventoryPolicy(s, cfg);
  assert.equal(p.reduceOnly, true);
  assert.equal(p.reduceSide, 'ASK');
  assert.equal(p.allowBid, false);
  assert.equal(p.allowAsk, true);
  assert.equal(p.reduceNotionalCap, 7.94);
  assert.equal(p.maxLeverage, 50);
  assert.equal(p.hardBreached, true);
});
