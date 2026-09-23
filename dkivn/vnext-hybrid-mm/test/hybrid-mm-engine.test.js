import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHybridMMState,
  evaluateHybridMM,
  inventoryPolicy,
  shouldRequote,
  REASON
} from '../src/hybrid-mm-engine.js';

function baseInput() {
  return {
    truthHealthy: true,
    marketAgeMs: 10,
    marketStaleMs: 2000,
    bestBid: 99.9,
    bestAsk: 100.1,
    referencePrice: 100,
    tickSize: 0.01,

    netInventoryNotional: 0,
    softInventoryLimit: 10,
    hardInventoryLimit: 20,
    inventoryQNorm: 0,

    baseGamma: 0.05,
    gammaToxicityMult: 2,
    gammaInventoryMult: 2,
    sigma2Fraction: 0.000001,
    sigma2Bps2: 1,
    kappaPerBps: 100,
    horizon: 1,

    toxicity: 0.1,
    toxicityHardStop: 0.9,
    toxicityCancelSkewBps: 5,
    bidToxicitySkewBps: 0,
    askToxicitySkewBps: 0,

    minHalfSpreadBps: 1,
    rebateBps: 1,
    bidExpectedMarkoutCostBps: 0.2,
    askExpectedMarkoutCostBps: 0.2,
    bidInventoryCostBps: 0,
    askInventoryCostBps: 0,
    latencyCostBps: 0.1,
    bidQueuePenaltyBps: 0.1,
    askQueuePenaltyBps: 0.1,
    minEvBps: 0,
  };
}

test('long inventory suppresses bid side and favors ask side', () => {
  const p = {};
  inventoryPolicy(15, 10, 20, p);
  assert.ok(p.bidWidenMult > 1);
  assert.ok(p.askWidenMult < 1);
  assert.ok(p.bidSizeMult < 1);
  assert.ok(p.askSizeMult > 1);
});

test('hard long inventory blocks inventory-adding bid side', () => {
  const i = baseInput();
  i.netInventoryNotional = 20;
  i.inventoryQNorm = 1;
  const o = createHybridMMState();
  evaluateHybridMM(i, o);
  assert.equal(o.bid.enabled, false);
  assert.equal(o.bid.reason, REASON.INVENTORY_BLOCK);
});

test('unhealthy truth fails closed on both sides', () => {
  const i = baseInput();
  i.truthHealthy = false;
  const o = createHybridMMState();
  evaluateHybridMM(i, o);
  assert.equal(o.bid.enabled, false);
  assert.equal(o.ask.enabled, false);
  assert.equal(o.bid.reason, REASON.TRUTH_UNHEALTHY);
});

test('negative EV suppresses quote despite valid market', () => {
  const i = baseInput();
  i.bidExpectedMarkoutCostBps = 20;
  const o = createHybridMMState();
  evaluateHybridMM(i, o);
  assert.equal(o.bid.enabled, false);
  assert.equal(o.bid.reason, REASON.NEGATIVE_EV);
});

test('quote output stays post-only / non-crossed', () => {
  const i = baseInput();
  const o = createHybridMMState();
  evaluateHybridMM(i, o);
  assert.ok(o.bid.price < i.bestAsk);
  assert.ok(o.ask.price > i.bestBid);
  assert.ok(o.bid.price < o.ask.price);
});

test('requote gate honors minimum quote life', () => {
  assert.equal(shouldRequote(100, 100.2, 1000, 2500, 2, false), false);
  assert.equal(shouldRequote(100, 100.2, 3000, 2500, 2, false), true);
  assert.equal(shouldRequote(100, 100.0001, 3000, 2500, 2, false), false);
  assert.equal(shouldRequote(100, 100.0001, 100, 2500, 2, true), true);
});
