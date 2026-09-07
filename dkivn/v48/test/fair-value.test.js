import test from 'node:test';
import assert from 'node:assert/strict';
import { microPrice, fairPrice, RollingVolatility } from '../src/fair-value.js';

test('microprice leans toward ask when bid size dominates', () => {
  const p = microPrice({ bestBid: 100, bestAsk: 101, bestBidQty: 9, bestAskQty: 1 });
  assert.ok(p > 100.5 && p < 101);
});

test('fair price is always clamped inside current spread', () => {
  assert.equal(fairPrice({ bestBid: 100, bestAsk: 101, bestBidQty: 9, bestAskQty: 1 }, 1, 50), 101);
  assert.equal(fairPrice({ bestBid: 100, bestAsk: 101, bestBidQty: 1, bestAskQty: 9 }, -1, 50), 100);
});

test('rolling volatility reports zero until price moves', () => {
  const v = new RollingVolatility(4);
  v.push(100);
  assert.equal(v.valueBps(), 0);
  v.push(101);
  assert.ok(v.valueBps() > 0);
});
