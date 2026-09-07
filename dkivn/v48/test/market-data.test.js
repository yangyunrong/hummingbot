import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketDataEngine } from '../src/market-data.js';

test('parses bookTicker and exposes valid top of book', () => {
  const m = new MarketDataEngine('BTC-SWAP-USDT');
  m.onBookTicker({ data: { b: '79000.1', a: '79000.2', bq: '1.5', aq: '2.0', t: 1000 } }, 1010);
  const s = m.snapshot(1010);
  assert.equal(s.bestBid, 79000.1);
  assert.equal(s.bestAsk, 79000.2);
  assert.equal(s.bestBidQty, 1.5);
  assert.equal(s.bestAskQty, 2.0);
  assert.equal(s.marketDataAgeMs, 0);
});

test('applies diffDepth updates and computes bounded imbalance', () => {
  const m = new MarketDataEngine('BTC-SWAP-USDT');
  m.onDiffDepth({ data: { b: [['79000.1','2'],['78999.9','1']], a: [['79000.2','1'],['79000.4','3']] } }, 2000);
  const s = m.snapshot(2000);
  assert.ok(s.depthImbalance > -1 && s.depthImbalance < 1);
  assert.equal(s.bids[0][0], 79000.1);
  assert.equal(s.asks[0][0], 79000.2);
});
