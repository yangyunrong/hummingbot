import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('loads safe V4.8 defaults', () => {
  const c = loadConfig({});
  assert.equal(c.symbol, 'BTC-SWAP-USDT');
  assert.equal(c.botPrefix, 'DKV48M_');
  assert.equal(c.quoteNotional, 10);
  assert.equal(c.softInventoryUsdt, 10);
  assert.equal(c.hardInventoryUsdt, 20);
  assert.equal(c.minQuoteLifeMs, 2500);
  assert.equal(c.marketStaleMs, 2000);
  assert.equal(c.clockSkewHardMs, 1500);
  assert.equal(c.apiErrorHardLimit, 3);
  assert.equal(c.liveEnabled, false);
  assert.ok(Object.isFrozen(c));
});
