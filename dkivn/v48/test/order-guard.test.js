import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOwnedPair, isOwnedOrder, shouldRequote } from '../src/order-guard.js';

test('ownership is prefix-only', () => {
  assert.equal(isOwnedOrder({clientOrderId:'DKV48M_1'}, 'DKV48M_'), true);
  assert.equal(isOwnedOrder({clientOrderId:'manual-1'}, 'DKV48M_'), false);
});

test('self-cross is rejected', () => {
  assert.throws(() => validateOwnedPair({bid:{price:101}, ask:{price:101}}), /SELF_CROSS/);
});

test('discretionary requote respects minimum quote life', () => {
  assert.equal(shouldRequote({price:100,createdAt:9000},{price:100.01},10000,{minQuoteLifeMs:2500,requoteBps:2},0.1), false);
});

test('material drift after minimum quote life triggers requote', () => {
  assert.equal(shouldRequote({price:100,createdAt:5000},{price:100.1},10000,{minQuoteLifeMs:2500,requoteBps:2},0.01), true);
});
