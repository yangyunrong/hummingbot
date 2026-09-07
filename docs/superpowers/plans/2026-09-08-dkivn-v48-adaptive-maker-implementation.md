# DKIVN V4.8 Adaptive Maker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current V4.7 single-cycle Toobit inventory maker with a testable event-driven dual-sided passive maker that uses fair value, inventory skew, one owned bid + one owned ask, amend-first requoting, private-event reconciliation, and fail-closed safety.

**Architecture:** Create a repository source-of-truth for the Tokyo Gateway and split the maker into focused Node.js modules: market data, fair value, inventory, quoting, order transport/execution, reconciliation, and risk/state control. Supabase remains the encrypted credential/control bridge and Tokyo Gateway remains the hot-path runtime; production deployment ends DISARMED and only the operator may START live quoting.

**Tech Stack:** Node.js 22 built-in `node:test`, native WebSocket/fetch, Supabase Edge Functions (Deno/TypeScript), PostgreSQL migrations, Nginx static console, systemd on Ubuntu Tokyo VPS.

**Spec:** `docs/superpowers/specs/2026-09-08-dkivn-v48-adaptive-maker-design.md`

## Global Constraints

- Trading symbol is exactly `BTC-SWAP-USDT`.
- V4.8-owned client order IDs must start with `DKV48M_`.
- At most one V4.8 bid and one V4.8 ask may exist simultaneously.
- Every live quote must be `LIMIT` + `POST_ONLY`.
- Baseline quote notional is 10 USDT per side.
- Target net inventory is 0 USDT; soft net limit 10 USDT; hard net limit 20 USDT.
- Requote threshold is `max(2 bps, one market-spec-aware minimum tick displacement)`.
- Minimum discretionary quote life is 2500 ms.
- Market data stale threshold is 2000 ms.
- API error streak >= 3 is a hard DISARM trigger.
- Public WS offline, Private WS offline, hard clock skew, hard risk threshold, reconciliation ambiguity, or self-cross ambiguity must fail closed.
- Manual/non-`DKV48M_` orders must never be canceled or modified.
- Deployment must end in `DISARMED` until the operator explicitly presses START.
- No API secret, gateway bearer token, session secret, or listenKey may be logged or persisted to user-visible storage.
- The engine must not self-trade, wash trade, quote-stuff, force volume targets, or optimize for promotional/rebate volume.

---

## File Structure

Create a dedicated source-of-truth tree instead of continuing to edit production-only `/opt` files without version control:

- `dkivn/v48/package.json` — test scripts and Node runtime metadata.
- `dkivn/v48/src/config.js` — constants/limits and environment parsing.
- `dkivn/v48/src/market-data.js` — bookTicker + diffDepth parsing and shallow-book state.
- `dkivn/v48/src/fair-value.js` — microprice, imbalance, volatility, fair-price clamp.
- `dkivn/v48/src/inventory.js` — long/short/net/gross inventory and skew decisions.
- `dkivn/v48/src/quote-engine.js` — desired bid/ask computation; no network calls.
- `dkivn/v48/src/order-guard.js` — ownership, self-cross, quote-age and side-disable guards.
- `dkivn/v48/src/toobit-transport.js` — exact Toobit REST signing/serialization and response normalization.
- `dkivn/v48/src/order-executor.js` — create/amend/cancel/reconcile owned orders only.
- `dkivn/v48/src/risk-engine.js` — readiness and hard/soft risk decisions.
- `dkivn/v48/src/gateway.js` — wiring, websockets, command state machine, telemetry loop.
- `dkivn/v48/test/*.test.js` — built-in Node tests for every pure/integration behavior.
- `dkivn/v48/bridge/index.ts` — versioned source for Supabase `dkivn-v47-gateway-telemetry` replacement.
- `dkivn/v48/console/index.html` — source mirror for the Nginx console maker panel.
- `dkivn/v48/deploy/deploy-gateway.sh` — deterministic backup/syntax-test/install/restart script.
- `dkivn/v48/deploy/verify-production.sh` — read-only production verification script.
- `supabase/migrations/<timestamp>_v48_maker_telemetry.sql` — additive telemetry schema migration if columns are absent.

---

### Task 1: Establish the V4.8 Source-of-Truth and Test Harness

**Files:**
- Create: `dkivn/v48/package.json`
- Create: `dkivn/v48/src/config.js`
- Create: `dkivn/v48/test/config.test.js`

**Interfaces:**
- Produces: `loadConfig(env)` returning a frozen V4.8 config object used by all later tasks.

- [ ] **Step 1: Write the failing configuration test**

```js
// dkivn/v48/test/config.test.js
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
  assert.equal(c.apiErrorHardLimit, 3);
  assert.equal(c.liveEnabled, false);
  assert.ok(Object.isFrozen(c));
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:
```bash
cd dkivn/v48 && node --test test/config.test.js
```
Expected: FAIL because `../src/config.js` does not exist.

- [ ] **Step 3: Add package metadata and minimal config implementation**

```json
{
  "name": "dkivn-v48-adaptive-maker",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/*.test.js",
    "check": "node --check src/gateway.js"
  }
}
```

```js
// dkivn/v48/src/config.js
export function loadConfig(env = process.env) {
  const n = (key, fallback) => Number.isFinite(Number(env[key])) ? Number(env[key]) : fallback;
  return Object.freeze({
    symbol: 'BTC-SWAP-USDT',
    botPrefix: 'DKV48M_',
    quoteNotional: n('V48_QUOTE_NOTIONAL', 10),
    softInventoryUsdt: n('V48_SOFT_INVENTORY_USDT', 10),
    hardInventoryUsdt: n('V48_HARD_INVENTORY_USDT', 20),
    minQuoteLifeMs: n('V48_MIN_QUOTE_LIFE_MS', 2500),
    requoteBps: n('V48_REQUOTE_BPS', 2),
    marketStaleMs: n('V48_MARKET_STALE_MS', 2000),
    apiErrorHardLimit: n('V48_API_ERROR_HARD_LIMIT', 3),
    dailyLossLimitUsdt: n('V48_DAILY_LOSS_LIMIT_USDT', 2),
    riskSoft: n('V48_RISK_SOFT', 75),
    riskHard: n('V48_RISK_HARD', 90),
    liveEnabled: String(env.GATEWAY_LIVE_ENABLED || 'false').toLowerCase() === 'true',
  });
}
```

- [ ] **Step 4: Run test and verify GREEN**

Run:
```bash
cd dkivn/v48 && node --test test/config.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dkivn/v48/package.json dkivn/v48/src/config.js dkivn/v48/test/config.test.js
git commit -m "feat: add V4.8 maker config and test harness"
```

---

### Task 2: Market Data Engine — bookTicker + diffDepth

**Files:**
- Create: `dkivn/v48/src/market-data.js`
- Create: `dkivn/v48/test/market-data.test.js`

**Interfaces:**
- Produces: `MarketDataEngine` with `onBookTicker(payload, recvMs)`, `onDiffDepth(payload, recvMs)`, and `snapshot(nowMs)`.
- `snapshot()` returns `{bestBid,bestAsk,bestBidQty,bestAskQty,midPrice,depthImbalance,marketDataAgeMs,bids,asks}`.

- [ ] **Step 1: Write failing tests for representative Toobit payloads**

```js
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
```

- [ ] **Step 2: Run and verify RED**

Run:
```bash
cd dkivn/v48 && node --test test/market-data.test.js
```
Expected: FAIL because `MarketDataEngine` is missing.

- [ ] **Step 3: Implement shallow depth state**

Implementation requirements:
- Accept both wrapped (`payload.data`) and direct payloads.
- Parse numeric bid/ask/qty safely.
- Reject `ask <= bid` snapshots.
- Treat zero depth quantity as deletion.
- Keep top 10 levels per side sorted descending bids / ascending asks.
- `depthImbalance = (bidDepth - askDepth) / (bidDepth + askDepth)`; return 0 if denominator is 0.
- `marketDataAgeMs = nowMs - lastValidUpdateMs`.

- [ ] **Step 4: Run tests and verify GREEN**

Run:
```bash
cd dkivn/v48 && node --test test/market-data.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dkivn/v48/src/market-data.js dkivn/v48/test/market-data.test.js
git commit -m "feat: add Toobit V4.8 market data engine"
```

---

### Task 3: Fair Value, Volatility, and Inventory Skew

**Files:**
- Create: `dkivn/v48/src/fair-value.js`
- Create: `dkivn/v48/src/inventory.js`
- Create: `dkivn/v48/test/fair-value.test.js`
- Create: `dkivn/v48/test/inventory.test.js`

**Interfaces:**
- Produces: `microPrice(book)`, `fairPrice(book, depthImbalance, imbalanceBps)`, `RollingVolatility`.
- Produces: `inventorySnapshot(positionRows)` and `inventoryPolicy(snapshot, config)`.

- [ ] **Step 1: Write failing fair-value tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { microPrice, fairPrice } from '../src/fair-value.js';

test('microprice leans toward ask when bid size dominates', () => {
  const p = microPrice({ bestBid: 100, bestAsk: 101, bestBidQty: 9, bestAskQty: 1 });
  assert.ok(p > 100.5 && p < 101);
});

test('fair price is always clamped inside current spread', () => {
  assert.equal(fairPrice({ bestBid: 100, bestAsk: 101, bestBidQty: 9, bestAskQty: 1 }, 1, 50), 101);
  assert.equal(fairPrice({ bestBid: 100, bestAsk: 101, bestBidQty: 1, bestAskQty: 9 }, -1, 50), 100);
});
```

- [ ] **Step 2: Write failing inventory policy tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryPolicy } from '../src/inventory.js';

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
```

- [ ] **Step 3: Run tests and verify RED**

Run:
```bash
cd dkivn/v48 && node --test test/fair-value.test.js test/inventory.test.js
```
Expected: FAIL because modules are missing.

- [ ] **Step 4: Implement deterministic fair value and inventory policy**

Use exactly:
```js
export function microPrice({bestBid,bestAsk,bestBidQty,bestAskQty}) {
  const denom = bestBidQty + bestAskQty;
  return denom > 0 ? (bestAsk * bestBidQty + bestBid * bestAskQty) / denom : (bestBid + bestAsk) / 2;
}
```

Fair-value adjustment is `mid * imbalanceBps / 10000 * depthImbalance`, then clamped to `[bestBid,bestAsk]`.
Inventory policy must produce `allowBid`, `allowAsk`, `bidSkewBps`, `askSkewBps` and scale continuously between zero and hard limit.

- [ ] **Step 5: Run tests and verify GREEN**

Run:
```bash
cd dkivn/v48 && node --test test/fair-value.test.js test/inventory.test.js
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add dkivn/v48/src/fair-value.js dkivn/v48/src/inventory.js dkivn/v48/test/fair-value.test.js dkivn/v48/test/inventory.test.js
git commit -m "feat: add V4.8 fair value and inventory policy"
```

---

### Task 4: Quote Engine and Self-Cross Guard

**Files:**
- Create: `dkivn/v48/src/quote-engine.js`
- Create: `dkivn/v48/src/order-guard.js`
- Create: `dkivn/v48/test/quote-engine.test.js`
- Create: `dkivn/v48/test/order-guard.test.js`

**Interfaces:**
- Produces: `buildDesiredQuotes({market,fair,inventory,config,tickSize,feeBps,adverseSelectionBps})`.
- Produces: `validateOwnedPair({bid,ask})`, `isOwnedOrder(order,prefix)`, `shouldRequote(current,desired,nowMs,config,tickSize)`.

- [ ] **Step 1: Write failing quote tests**

Test these exact behaviors:
- Empty inventory permits one 10 USDT bid and one 10 USDT ask.
- Bid is `< bestAsk`; ask is `> bestBid`.
- Bid and ask cannot overlap each other.
- Hard-long inventory disables bid.
- Hard-short inventory disables ask.
- Quote price rounds to exchange tick size.

- [ ] **Step 2: Write failing order-guard tests**

```js
assert.equal(isOwnedOrder({clientOrderId:'DKV48M_1'}, 'DKV48M_'), true);
assert.equal(isOwnedOrder({clientOrderId:'manual-1'}, 'DKV48M_'), false);
assert.throws(() => validateOwnedPair({bid:{price:101}, ask:{price:101}}), /SELF_CROSS/);
assert.equal(shouldRequote({price:100,createdAt:9000},{price:100.01},10000,{minQuoteLifeMs:2500,requoteBps:2},0.1), false);
```

- [ ] **Step 3: Run and verify RED**

Run:
```bash
cd dkivn/v48 && node --test test/quote-engine.test.js test/order-guard.test.js
```
Expected: FAIL.

- [ ] **Step 4: Implement minimal quote and guard logic**

Rules:
- Compute minimum required edge as `2 * makerFeeBps + adverseSelectionBps` before choosing a discretionary spread.
- Never manufacture order churn when desired price difference is below requote threshold.
- Safety cancellation may ignore `minQuoteLifeMs`; discretionary amendments may not.
- `isOwnedOrder` must require prefix match only; no exchange order ID heuristics.

- [ ] **Step 5: Run and verify GREEN**

Run:
```bash
cd dkivn/v48 && node --test test/quote-engine.test.js test/order-guard.test.js
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add dkivn/v48/src/quote-engine.js dkivn/v48/src/order-guard.js dkivn/v48/test/quote-engine.test.js dkivn/v48/test/order-guard.test.js
git commit -m "feat: add V4.8 quote and self-cross guards"
```

---

### Task 5: Toobit Transport Adapter — Exact Signed Wire Format

**Files:**
- Create: `dkivn/v48/src/toobit-transport.js`
- Create: `dkivn/v48/test/toobit-transport.test.js`

**Interfaces:**
- Produces: `buildSignedFormRequest({path,method,params,apiKey,secret,timestamp,recvWindow})`.
- Produces: `normalizeToobitResponse(status, data)`.
- No function in this file reads environment variables directly.

- [ ] **Step 1: Write a failing regression test for the production bug**

The exact bug to prevent is Toobit returning `Missing required parameter 'symbol'` when business fields were placed in a JSON body not parsed by the live single-order path.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSignedFormRequest } from '../src/toobit-transport.js';

test('single regular order serializes symbol into form body before signing', () => {
  const r = buildSignedFormRequest({
    path:'/api/v2/futures/order', method:'POST', apiKey:'k', secret:'s', timestamp:123,
    params:{symbol:'BTC-SWAP-USDT',side:'BUY',positionSide:'LONG',type:'LIMIT',newClientOrderId:'DKV48M_x',valueQuantity:'10.00',price:'79000.1',timeInForce:'POST_ONLY'}
  });
  assert.equal(r.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.match(r.body, /symbol=BTC-SWAP-USDT/);
  assert.match(r.body, /timeInForce=POST_ONLY/);
  assert.match(r.body, /timestamp=123/);
  assert.match(r.body, /signature=[0-9a-f]{64}/);
});
```

- [ ] **Step 2: Run and verify RED**

Run:
```bash
cd dkivn/v48 && node --test test/toobit-transport.test.js
```
Expected: FAIL because transport adapter does not exist.

- [ ] **Step 3: Implement form-encoded single-order transport**

Requirements:
- Preserve parameter order between HMAC input and actual body.
- Use lowercase HMAC-SHA256 hex.
- Include business parameters + `timestamp` + optional `recvWindow` in the form body.
- Append `signature` as the final body field.
- Header `X-BB-APIKEY` contains the API key.
- Header `Content-Type` is `application/x-www-form-urlencoded` for the live single regular order path.
- Keep JSON-body signing as a separate helper only for endpoints that explicitly require JSON (e.g. documented batch-order routes); do not mix the two encodings.

- [ ] **Step 4: Add response normalization tests**

Cover:
- HTTP 2xx + `code:200` => success.
- `code:-2015` => non-retryable auth/IP/permission error.
- `code:-1003` => retryable rate-limit error.
- message-only `Missing required parameter 'symbol'` => parameter/serialization error.

- [ ] **Step 5: Run and verify GREEN**

Run:
```bash
cd dkivn/v48 && node --test test/toobit-transport.test.js
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add dkivn/v48/src/toobit-transport.js dkivn/v48/test/toobit-transport.test.js
git commit -m "fix: harden Toobit V2 single-order transport"
```

---

### Task 6: Order Executor — Create, Amend, Cancel, Reconcile Owned Orders

**Files:**
- Create: `dkivn/v48/src/order-executor.js`
- Create: `dkivn/v48/test/order-executor.test.js`
- Create: `dkivn/v48/bridge/index.ts`

**Interfaces:**
- Consumes: quote decisions from Task 4 and signed transport from Task 5.
- Produces: `OrderExecutor.reconcile(openOrders)`, `applyDesiredQuotes(desired, nowMs)`, `cancelOwned(reason)`.
- Bridge exposes authenticated routes `/maker/open-orders`, `/maker/place`, `/maker/update`, `/maker/cancel`, `/maker/cancel-all` restricted to `DKV48M_`.

- [ ] **Step 1: Write failing executor tests with a fake transport**

Required cases:
- Manual + `DKV48M_` open-order snapshot preserves manual order and adopts only V4.8 order.
- Desired quote missing => create one POST_ONLY order.
- Existing quote materially differs after min quote life => amend, not cancel-new.
- Reconciliation sees two owned bids => throw `AMBIGUOUS_OWNED_ORDERS`.
- `cancelOwned()` emits cancel only for `DKV48M_` orders.

- [ ] **Step 2: Run and verify RED**

Run:
```bash
cd dkivn/v48 && node --test test/order-executor.test.js
```
Expected: FAIL.

- [ ] **Step 3: Implement executor state and bridge contract**

Bridge validation must enforce:
- symbol fixed server-side to `BTC-SWAP-USDT`.
- prefix fixed server-side to `DKV48M_`.
- side only `BUY|SELL`; positionSide only `LONG|SHORT`.
- type only `LIMIT`; timeInForce fixed to `POST_ONLY`.
- per-order valueQuantity bounded to safe configured range.
- no cancel/update endpoint may touch a clientOrderId without the prefix.
- successful accepted live order changes credential `trade_permission_status` to `VERIFIED`; declarations alone never do.

- [ ] **Step 4: Run tests and TypeScript syntax checks**

Run:
```bash
cd dkivn/v48 && node --test test/order-executor.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dkivn/v48/src/order-executor.js dkivn/v48/test/order-executor.test.js dkivn/v48/bridge/index.ts
git commit -m "feat: add V4.8 owned order executor and bridge"
```

---

### Task 7: Risk Engine and Runtime State Machine

**Files:**
- Create: `dkivn/v48/src/risk-engine.js`
- Create: `dkivn/v48/test/risk-engine.test.js`

**Interfaces:**
- Produces: `evaluateReadiness(ctx, config)` and `evaluateRuntimeRisk(ctx, config)` returning `{ok,state,reason,allowBid,allowAsk}`.

- [ ] **Step 1: Write failing hard-stop tests**

Test each independently:
- public WS false => DISARM.
- private WS false => DISARM.
- market age 2001 ms => DISARM.
- API error streak 3 => DISARM.
- reconciliation ambiguous => DISARM.
- self-cross guard failure => DISARM.
- risk hard threshold => DISARM.
- soft inventory limit => keep RUNNING but skew/de-risk.
- hard inventory limit => keep reducing side only.

- [ ] **Step 2: Run and verify RED**

Run:
```bash
cd dkivn/v48 && node --test test/risk-engine.test.js
```
Expected: FAIL.

- [ ] **Step 3: Implement explicit priority-ordered risk decisions**

Hard-stop priority must be deterministic so the console receives the most actionable reason. Recommended order:
1. `PUBLIC_WS_OFFLINE`
2. `PRIVATE_WS_OFFLINE`
3. `MARKET_STALE`
4. `CLOCK_SKEW_HIGH`
5. `RECONCILIATION_AMBIGUOUS`
6. `SELF_CROSS_GUARD`
7. `API_ERROR_STREAK`
8. `DAILY_LOSS_LIMIT`
9. `RISK_RATE_HARD_LIMIT`

- [ ] **Step 4: Run and verify GREEN**

Run:
```bash
cd dkivn/v48 && node --test test/risk-engine.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dkivn/v48/src/risk-engine.js dkivn/v48/test/risk-engine.test.js
git commit -m "feat: add V4.8 fail-closed risk engine"
```

---

### Task 8: Gateway Wiring and Event-Driven Requote Loop

**Files:**
- Create: `dkivn/v48/src/gateway.js`
- Create: `dkivn/v48/test/gateway-events.test.js`

**Interfaces:**
- Consumes all modules from Tasks 1–7.
- Produces the systemd runtime entrypoint deployed to `/opt/dkivn-gateway/gateway.js`.

- [ ] **Step 1: Write failing event-loop tests**

Use injected fake market/order transports; no network in tests.

Required event cases:
- bookTicker price change triggers quote evaluation.
- meaningful depth imbalance change triggers quote evaluation.
- unchanged market does not create a timer-driven cancel-new loop.
- fill/partial fill triggers reconciliation and immediate inventory/quote recalculation.
- PAUSE cancels owned quotes and stops new create/amend while keeping connectivity.
- RESUME performs reconciliation before RUNNING.
- START remains DISARMED if any readiness guard fails.

- [ ] **Step 2: Run and verify RED**

Run:
```bash
cd dkivn/v48 && node --test test/gateway-events.test.js
```
Expected: FAIL.

- [ ] **Step 3: Implement gateway orchestration**

Key requirements:
- Subscribe public WS to both `bookTicker` and `diffDepth` for the same symbol.
- Private WS remains listenKey-based and authoritative for fast order/fill changes.
- Watchdog timer may reconcile/refresh but must not create quote churn when desired quotes are unchanged.
- START sequence: snapshot -> owned-open-order reconciliation -> public/private freshness -> READY -> RUNNING.
- DISARM sequence: cancel only `DKV48M_` -> state DISARMED -> keep monitoring.

- [ ] **Step 4: Run complete Node test suite and syntax check**

Run:
```bash
cd dkivn/v48 && npm test && node --check src/gateway.js
```
Expected: all tests PASS and syntax exit code 0.

- [ ] **Step 5: Commit**

```bash
git add dkivn/v48/src/gateway.js dkivn/v48/test/gateway-events.test.js
git commit -m "feat: wire V4.8 event-driven adaptive maker gateway"
```

---

### Task 9: Telemetry Schema and Console Maker Panel

**Files:**
- Create: `supabase/migrations/<timestamp>_v48_maker_telemetry.sql`
- Create: `dkivn/v48/console/index.html`
- Create: `dkivn/v48/test/telemetry-contract.test.js`

**Interfaces:**
- Gateway writes backward-compatible telemetry plus V4.8 fields from the approved spec.
- Console reads runtime truth only; it cannot infer RUNNING from a START click.

- [ ] **Step 1: Write failing telemetry contract test**

Assert emitted telemetry contains:
`fair_price`, `micro_price`, `depth_imbalance`, `short_volatility`, `maker_bid_price`, `maker_ask_price`, `maker_bid_notional`, `maker_ask_notional`, `long_inventory_notional`, `short_inventory_notional`, `net_inventory_notional`, `gross_inventory_notional`, `quote_age_bid_ms`, `quote_age_ask_ms`, `fill_count`, `maker_fill_count`, `maker_fill_rate`, `amend_count`, `cancel_count`, `cancel_to_fill_ratio`, `estimated_adverse_selection_bps`, `estimated_net_edge_bps`, `last_reject_code`, `last_reject_message`, `last_reject_at`.

- [ ] **Step 2: Run and verify RED**

Run:
```bash
cd dkivn/v48 && node --test test/telemetry-contract.test.js
```
Expected: FAIL until gateway telemetry is extended.

- [ ] **Step 3: Add additive migration**

Migration rules:
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` only.
- Preserve existing V4.7 fields.
- Use numeric for prices/bps/notional, bigint/integer for counters/ages, text for reject code/message, timestamptz for reject time.
- Do not store secrets.

- [ ] **Step 4: Add console Maker panel**

The panel must show exactly the approved V4.8 metrics and runtime state. Existing pages for diagnostics, funding/arbitrage, exchange management, PnL, risk, and DISARM remain present.

- [ ] **Step 5: Run test and static JS syntax extraction/check**

Run:
```bash
cd dkivn/v48 && node --test test/telemetry-contract.test.js
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations dkivn/v48/console/index.html dkivn/v48/test/telemetry-contract.test.js
git commit -m "feat: add V4.8 maker telemetry and console panel"
```

---

### Task 10: Production Deployment Scripts and Fail-Closed Rollout

**Files:**
- Create: `dkivn/v48/deploy/deploy-gateway.sh`
- Create: `dkivn/v48/deploy/verify-production.sh`

**Interfaces:**
- Deployment source: `dkivn/v48/src/gateway.js` plus local imported modules bundled/copied into `/opt/dkivn-gateway/v48/`.
- Service entrypoint must be deterministic and restorable.

- [ ] **Step 1: Write deployment script with hard gates**

`deploy-gateway.sh` must:
1. Refuse to deploy unless `npm test` passes.
2. Refuse to deploy unless `node --check` passes.
3. Backup current `/opt/dkivn-gateway` into a timestamped root-owned backup.
4. Install V4.8 files without printing secret env values.
5. Set `GATEWAY_LIVE_ENABLED=false` for the first production boot.
6. Restart `dkivn-gateway.service`.
7. Exit nonzero unless systemd is active.

- [ ] **Step 2: Write read-only production verifier**

`verify-production.sh` must check:
- systemd active.
- Bridge health expected version.
- public WS true.
- private WS true.
- runtime `DISARMED`.
- open V4.8 bot orders = 0 immediately after deployment.
- account snapshot readable.
- market telemetry fresh.

- [ ] **Step 3: Dry-run scripts in a non-production/local path**

Run shell syntax checks:
```bash
bash -n dkivn/v48/deploy/deploy-gateway.sh
bash -n dkivn/v48/deploy/verify-production.sh
```
Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add dkivn/v48/deploy
git commit -m "ops: add fail-closed V4.8 deployment verification"
```

---

### Task 11: Supabase Deployment and Database Verification

**Files:**
- Modify deployed Edge Function from source: `dkivn/v48/bridge/index.ts`
- Apply migration: `supabase/migrations/<timestamp>_v48_maker_telemetry.sql`

**Interfaces:**
- Production Bridge remains custom bearer-authenticated; do not change auth model while deploying V4.8.

- [ ] **Step 1: Apply additive migration**

Use the Supabase migration API; do not execute DDL through ad-hoc `execute_sql`.

- [ ] **Step 2: Deploy Bridge with execution globally disabled by Gateway**

Bridge may expose V4.8 create/update/cancel routes, but Gateway remains `GATEWAY_LIVE_ENABLED=false` during deployment verification.

- [ ] **Step 3: Verify Bridge read-only routes**

Check:
- `/health`
- `/account-snapshot`
- `/maker/open-orders`

Expected: 200 and no secret material.

- [ ] **Step 4: Run Supabase security and performance advisors**

Record any new advisory caused by the migration and fix only V4.8-related findings before proceeding.

- [ ] **Step 5: Commit any schema/source adjustments discovered during verification**

```bash
git add dkivn/v48/bridge supabase/migrations
git commit -m "fix: align V4.8 bridge with production schema verification"
```

---

### Task 12: Tokyo Gateway Production Deploy — Execution Disabled

**Files:**
- Deploy from: `dkivn/v48/src/*`
- Deploy console from: `dkivn/v48/console/index.html`

- [ ] **Step 1: Run the full repository V4.8 test suite immediately before deployment**

```bash
cd dkivn/v48 && npm test && node --check src/gateway.js
```
Expected: all PASS.

- [ ] **Step 2: Backup and deploy with live disabled**

Use `deploy-gateway.sh`; confirm backup path exists before restart.

- [ ] **Step 3: Verify runtime evidence**

Expected production truth:
- service active.
- runtime `DISARMED`.
- reason `STARTUP_SAFE` or deployment-safe equivalent.
- public/private WS healthy.
- `bookTicker` and `diffDepth` telemetry fresh.
- quote calculation telemetry moving.
- no V4.8 open bot orders.

- [ ] **Step 4: Deploy console and verify HTTP**

Check HTTPS 200, `Content-Type: text/html`, `Cache-Control: no-store`, and Maker panel fields present.

- [ ] **Step 5: Commit any production-only parity corrections back to repo before continuing**

Do not allow `/opt` to diverge from repository source-of-truth.

---

### Task 13: Controlled Live Acceptance — One Passive Quote, Amend, Cancel, DISARM

**Files:**
- No new source files unless a defect is found; defects require a failing regression test before code changes.

- [ ] **Step 1: Confirm operator intent and enable live execution**

Only after Tasks 1–12 pass. Set `GATEWAY_LIVE_ENABLED=true`, restart, and confirm runtime remains DISARMED until START.

- [ ] **Step 2: Operator presses START once**

Expected state path: `DISARMED -> READY -> RUNNING` only after reconciliation.

- [ ] **Step 3: Verify first accepted V4.8 quote**

Evidence required:
- Toobit open order exists.
- clientOrderId starts `DKV48M_`.
- `timeInForce=POST_ONLY`.
- no manual order modified.
- `trade_permission_status` becomes `VERIFIED` only after exchange acceptance.

- [ ] **Step 4: Verify second side without self-cross**

At most one owned bid + one owned ask. If account/position mode cannot support the designed dual-side semantics, immediately DISARM and use the spec-approved single-direction inventory fallback rather than forcing invalid orders.

- [ ] **Step 5: Verify amend path**

Move desired price materially beyond threshold after minimum quote life and confirm existing owned order is amended rather than gratuitously cancel-new when Toobit accepts update.

- [ ] **Step 6: Verify private WS reconciliation**

Confirm order event/fill event updates local state without waiting for REST polling.

- [ ] **Step 7: Verify DISARM**

Press DISARM and prove:
- owned `DKV48M_` orders canceled.
- manual orders unchanged.
- runtime becomes `DISARMED`.
- connectivity/monitoring remains alive.

- [ ] **Step 8: End acceptance in DISARMED**

Even if acceptance succeeds, leave production DISARMED unless the operator explicitly chooses to start normal operation afterward.

---

## Self-Review Results

- **Spec coverage:** All 13 success criteria in the approved design map to Tasks 2–13. Market data, fair value, inventory, quote behavior, self-cross prevention, private reconciliation, risk, telemetry, console compatibility, deployment safety, and live acceptance are all explicitly covered.
- **Placeholder scan:** No `TBD`, `TODO`, or unspecified implementation steps remain.
- **Type/interface consistency:** Market snapshots feed fair value; inventory policy feeds quote engine; quote engine feeds order executor; risk engine gates gateway state; gateway feeds telemetry/console. Prefix is consistently `DKV48M_` and symbol is consistently `BTC-SWAP-USDT`.
- **Production safety:** No live order is required before Task 13. Tasks 11–12 deploy read/quote-calculation capability with execution disabled and end DISARMED.
