import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDesiredQuotes } from '../src/quote-engine.js';

const market = { bestBid: 100, bestAsk: 101 };
const config = { quoteNotional: 10, minQuoteNotional: 5 };

test('empty inventory permits one passive 10 USDT bid and ask', () => {
  const q = buildDesiredQuotes({market,fair:100.5,inventory:{allowBid:true,allowAsk:true,bidSkewBps:0,askSkewBps:0},config,tickSize:0.1,feeBps:1.2,adverseSelectionBps:1});
  assert.equal(q.bid.notional, 10);
  assert.equal(q.ask.notional, 10);
  assert.ok(q.bid.price < market.bestAsk);
  assert.ok(q.ask.price > market.bestBid);
  assert.ok(q.bid.price < q.ask.price);
  assert.equal(Number((q.bid.price / 0.1).toFixed(8)) % 1, 0);
  assert.equal(Number((q.ask.price / 0.1).toFixed(8)) % 1, 0);
});

test('hard long inventory disables bid', () => {
  const q = buildDesiredQuotes({market,fair:100.5,inventory:{allowBid:false,allowAsk:true,bidSkewBps:4,askSkewBps:-4},config,tickSize:0.1,feeBps:1.2,adverseSelectionBps:1});
  assert.equal(q.bid, null);
  assert.ok(q.ask);
});

test('hard short inventory disables ask', () => {
  const q = buildDesiredQuotes({market,fair:100.5,inventory:{allowBid:true,allowAsk:false,bidSkewBps:-4,askSkewBps:4},config,tickSize:0.1,feeBps:1.2,adverseSelectionBps:1});
  assert.ok(q.bid);
  assert.equal(q.ask, null);
});

test('reduce-only long caps passive ask to actual inventory notional', () => {
  const q = buildDesiredQuotes({
    market,
    fair:100.5,
    inventory:{allowBid:false,allowAsk:true,bidSkewBps:4,askSkewBps:-4,reduceOnly:true,reduceSide:'ASK',reduceNotionalCap:7.94},
    config,
    tickSize:0.1,
    feeBps:1.2,
    adverseSelectionBps:1,
  });
  assert.equal(q.bid, null);
  assert.ok(q.ask);
  assert.equal(q.ask.notional, 7.94);
});

test('reduce-only quote is suppressed when remaining inventory is below exchange minimum', () => {
  const q = buildDesiredQuotes({
    market,
    fair:100.5,
    inventory:{allowBid:false,allowAsk:true,bidSkewBps:4,askSkewBps:-4,reduceOnly:true,reduceSide:'ASK',reduceNotionalCap:3.5},
    config,
    tickSize:0.1,
    feeBps:1.2,
    adverseSelectionBps:1,
  });
  assert.equal(q.bid, null);
  assert.equal(q.ask, null);
});
