# DKIVN V4.9 Apple-Style UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild DKIVN V4.9 as a polished Apple Stocks × Wallet inspired trading terminal for mobile and desktop, with real Toobit candlestick data and full PnL/inventory/volume/MM-quality chart surfaces, while preserving every existing trading-safety and lifecycle contract.

**Architecture:** Keep the existing no-build vanilla HTML/CSS/JavaScript console and Tokyo Node runtime. Add a read-only observation layer and authenticated Kline/history endpoints beside the trading runtime; use native Canvas modules in the browser for charts. The trading hot path remains unchanged except for a synchronous, non-blocking observation callback that never awaits I/O. Deploy first to `/v49-apple/`; promote to `/v49/` only after live-data and visual approval.

**Tech Stack:** Node.js 22 ESM, native `node:test`, native `fetch`/`WebSocket`, HTML5 Canvas, CSS Grid/Flexbox/Container Queries, Nginx static serving/proxy, Toobit USDT-M REST + WebSocket market data, existing Tokyo V49 local executor.

**Spec:** `docs/superpowers/specs/2026-09-08-dkivn-v49-apple-ui-redesign-design.md`

## Global Constraints

- Preserve exactly five primary destinations: Overview, Strategy, Orders, Risk, More.
- Preserve Tokyo executor endpoints and semantics: START, Pause, Resume, DISARM, Flat All.
- Preserve runtime capability gating, persistent desired-state semantics, exact-contract reduce-only tail handling, AUTO position-aware sizing, and strategy persistence.
- Never store API keys or secrets in `localStorage`, `sessionStorage`, IndexedDB, cookies, chart buffers, or browser logs.
- Main market chart must use real Toobit data. Never fabricate candles or execution data.
- First-release chart intervals are exactly `1m`, `5m`, `15m`, and `1h`.
- Observation/history code must be best-effort, bounded, and non-blocking; failure to record a chart point must never delay, reject, retry, or cancel an order.
- Mobile support: 360, 390, 393, 402, and 430 CSS-pixel widths; no full-page horizontal overflow; safe-area support required.
- Desktop layout begins at `min-width: 980px`, uses a compact left navigation rail, and keeps content width bounded on large displays.
- Primary visual palette is near-black/white/gray with blue for interaction; green/orange/red are semantic-only.
- No React, Vue, Vite, third-party chart library, external icon package, or new frontend build system.
- Every behavior change follows TDD: failing test first, minimal implementation, green full suite, then commit.
- `/v49/` stays untouched until `/v49-apple/` is manually approved.

---

### Task 1: Synchronize the production-safe V4.9 runtime baseline

**Files:**
- Modify from live production source: `dkivn/v49/src/maker-core.js`
- Modify from live production source: `dkivn/v49/src/live-runtime.js`
- Modify from live production source: `dkivn/v49/src/toobit-direct.js`
- Modify from live production source: `dkivn/v49/src/auto-run-supervisor.js`
- Modify from live production source: `dkivn/v49/src/run-intent.js`
- Modify: `dkivn/v49/test/high-leverage-takeover.test.js`
- Modify: `dkivn/v49/test/toobit-direct.test.js`
- Modify: `dkivn/v49/test/run-intent.test.js`
- Create: `dkivn/v49/test/auto-sizing.test.js`

**Interfaces:**
- Consumes: live files under `/opt/dkivn-v49/` on `tokyo-gateway`.
- Produces: a Git branch baseline whose runtime behavior exactly matches the currently deployed safe runtime before any UI work begins.
- Production invariants to preserve: `autoQuoteSizing()`, exact `quantity` tail closes, `RECOVERING` transient state, single START semantics, 250ms decision heartbeat, hard stop on `API_ERROR_STREAK`, and one-shot/manual-rearm recovery behavior.

- [ ] **Step 1: Create a production-baseline contract test before copying source**

Add assertions that explicitly encode the deployed fixes:

```js
// test/auto-sizing.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {autoQuoteSizing} from '../src/maker-core.js';

test('100U at 50x and 70% utilization sizes near 52.5U per side', () => {
  const s = autoQuoteSizing({
    balance:100, available:100, leverage:50, capitalUtilization:.7,
    inventory:{grossInventoryNotional:0,netInventoryNotional:0},
    openOrderExposure:0, baseQuoteNotional:10, minQuoteNotional:5,
    maxQuoteNotional:100, slicePct:.015, allowBid:true, allowAsk:true,
    reduceOnly:false
  });
  assert.equal(s.mode,'AUTO');
  assert.equal(s.baseQuoteNotional,52.5);
  assert.equal(s.bidQuoteNotional,52.5);
  assert.equal(s.askQuoteNotional,52.5);
});
```

Extend the high-leverage test with an exact-contract tail case:

```js
test('0.1-contract SHORT tail emits exact BUY SHORT quantity', () => {
  const snap=inventorySnapshot([{side:'SHORT',position:0.1,positionValue:7.82,leverage:50}]);
  const policy=inventoryPolicy(snap,{hardInventoryUsdt:200,maxLeverageForDualSide:20});
  const q=buildDesiredQuotes({
    market:{bestBid:78300,bestAsk:78300.1},fair:78300.05,
    inventory:policy,
    config:{quoteNotional:60,minQuoteNotional:5,minNetEdgeBps:4},tickSize:.1
  });
  assert.equal(q.ask,null);
  assert.equal(q.bid.quantity,0.1);
});
```

Update `run-intent.test.js` so `API_ERROR_STREAK` is HARD and failed bootstrap recovery requires manual rearm; it must not expect repeated recovery loops.

- [ ] **Step 2: Run the new/updated tests and verify the current branch fails**

Run:

```bash
cd dkivn/v49
npm test -- --test-name-pattern='100U at 50x|0.1-contract SHORT|manual rearm|API_ERROR_STREAK'
```

Expected: FAIL because the branch is behind production and does not yet contain all current runtime behavior.

- [ ] **Step 3: Copy only the reviewed production runtime source into the worktree**

Use the connected Tokyo host as the source of truth. Copy these exact files from `/opt/dkivn-v49/` into the isolated worktree equivalents after inspecting the diff:

```text
maker-core.js
live-runtime.js
toobit-direct.js
auto-run-supervisor.js
run-intent.js
```

Do not copy credentials, `/etc/dkivn-v49/*`, run-state files, logs, or systemd units.

- [ ] **Step 4: Verify baseline behavior is green before UI work**

Run:

```bash
cd dkivn/v49
npm test
npm run check
```

Expected: all baseline tests PASS; the known production suite target is 38/38 or higher after the added explicit baseline test coverage.

- [ ] **Step 5: Commit the baseline synchronization**

```bash
git add dkivn/v49/src dkivn/v49/test
git commit -m "fix: sync V49 production-safe runtime baseline"
```

---

### Task 2: Add bounded read-only observation history and real Toobit Kline proxy

**Files:**
- Create: `dkivn/v49/src/observation-buffer.js`
- Create: `dkivn/v49/src/chart-data-service.js`
- Modify: `dkivn/v49/src/live-runtime.js`
- Modify: `dkivn/v49/src/control-server.js`
- Create: `dkivn/v49/test/observation-buffer.test.js`
- Create: `dkivn/v49/test/chart-data-service.test.js`

**Interfaces:**
- Produces `ObservationBuffer` with:
  - `recordSnapshot(status, atMs)`
  - `recordExecution(event, context)`
  - `read({sinceMs, limit}) -> {snapshots, executions}`
- Produces `ChartDataService` with:
  - `getKlines({interval, limit, nowMs}) -> Promise<Candle[]>`
- Produces authenticated Tokyo endpoints:
  - `GET /market/klines?interval=1m&limit=240`
  - `GET /history?since=<epoch-ms>&limit=2000`
- Adds to `runtime.status()` only read-only presentation fields: market top-of-book/microprice, current desired quotes, contract multiplier, and current sizing.

- [ ] **Step 1: Write failing ring-buffer tests**

```js
// test/observation-buffer.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {ObservationBuffer} from '../src/observation-buffer.js';

test('snapshot history is bounded and ordered',()=>{
  const b=new ObservationBuffer({maxSnapshots:3,maxExecutions:2});
  for(let i=1;i<=4;i++) b.recordSnapshot({fairPrice:i,account:{todayPnl:i}},i*1000);
  const h=b.read({sinceMs:0,limit:20});
  assert.deepEqual(h.snapshots.map(x=>x.t),[2000,3000,4000]);
});

test('execution records keep maker flag and fill notional fields',()=>{
  const b=new ObservationBuffer({maxSnapshots:3,maxExecutions:3});
  b.recordExecution({c:'DKV49M_x',S:'BUY',X:'FILLED',l:'0.1',L:'78000',m:true,E:1000},{contractMultiplier:.001});
  const [x]=b.read({sinceMs:0,limit:20}).executions;
  assert.equal(x.clientOrderId,'DKV49M_x');
  assert.equal(x.maker,true);
  assert.equal(x.notional,7.8);
});
```

- [ ] **Step 2: Write failing Kline-service tests**

```js
// test/chart-data-service.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {ChartDataService} from '../src/chart-data-service.js';

test('Kline service whitelists interval and sends start/end time',async()=>{
  let seen='';
  const svc=new ChartDataService({fetchImpl:async url=>{
    seen=String(url);
    return {ok:true,json:async()=>[[1000,'1','3','0.5','2','10',1999,'20',2,'5','10']]};
  }});
  const rows=await svc.getKlines({interval:'5m',limit:240,nowMs:10_000_000});
  assert.match(seen,/\/quote\/v1\/klines\?/);
  assert.match(seen,/symbol=BTC-SWAP-USDT/);
  assert.match(seen,/interval=5m/);
  assert.match(seen,/startTime=/);
  assert.match(seen,/endTime=/);
  assert.equal(rows[0].open,1);
  await assert.rejects(()=>svc.getKlines({interval:'2s',limit:10}),/INVALID_INTERVAL/);
});
```

- [ ] **Step 3: Run tests and verify RED**

```bash
cd dkivn/v49
node --test test/observation-buffer.test.js test/chart-data-service.test.js
```

Expected: FAIL because both modules are absent.

- [ ] **Step 4: Implement `ObservationBuffer` as an in-memory bounded ring**

Use arrays with hard caps. Snapshot sampling will occur every 5 seconds, maximum 17,280 snapshots (24 hours at 5-second resolution). Execution records are event-driven and capped at 5,000.

Snapshot shape:

```js
{
  t, fair, micro, bestBid, bestAsk, botBid, botAsk,
  balance, available, dailyPnl, realizedPnl, unrealizedPnl,
  long, short, net, gross, leverage, riskRate,
  marketDataAgeMs, apiErrorStreak, quoteCycles
}
```

`recordSnapshot` and `recordExecution` must be synchronous, throw-free at call sites, and perform no network or disk I/O.

- [ ] **Step 5: Implement `ChartDataService` against real Toobit Klines**

Use fixed symbol `BTC-SWAP-USDT`, interval map:

```js
const INTERVAL_MS={
  '1m':60_000,
  '5m':300_000,
  '15m':900_000,
  '1h':3_600_000
};
```

For `limit=240`, calculate:

```js
const endTime=nowMs;
const startTime=endTime-(INTERVAL_MS[interval]*limit);
```

Call:

```text
https://api.toobit.com/quote/v1/klines?symbol=BTC-SWAP-USDT&interval=<interval>&startTime=<ms>&endTime=<ms>&limit=<limit>
```

Normalize each array row into `{t,open,high,low,close,volume,closeTime,quoteVolume,trades}`. Never invent missing candles.

- [ ] **Step 6: Attach observation without blocking the trading hot path**

Update the runtime constructor signature:

```js
constructor({credentialStore,liveEnabled=false,symbol='BTC-SWAP-USDT',prefix='DKV49M_',observer=null}={})
```

When a private WS `contractExecutionReport` arrives, call only:

```js
try { this.observer?.recordExecution(event,{contractMultiplier:this.contractMultiplier}); } catch {}
```

Do not `await` the observer and do not make any observer result influence order logic.

Expose market/sizing presentation data in `status()`:

```js
market:{
  bestBid:m.bestBid,bestAsk:m.bestAsk,midPrice:m.midPrice,
  microPrice:microPrice(m),depthImbalance:m.depthImbalance
},
quotes:{bid:this.lastDesired?.bid??null,ask:this.lastDesired?.ask??null},
sizing:this.lastSizing??null,
contractMultiplier:this.contractMultiplier
```

- [ ] **Step 7: Add authenticated read-only endpoints in `control-server.js`**

Instantiate the buffer/service and sample every 5 seconds:

```js
const observation=new ObservationBuffer({maxSnapshots:17_280,maxExecutions:5_000});
const charts=new ChartDataService();
setInterval(()=>{try{observation.recordSnapshot(supervisor.status(),Date.now())}catch{}},5_000).unref();
```

Routes after admin authentication:

```js
if(p==='/market/klines'&&req.method==='GET') {
  const interval=url.searchParams.get('interval')||'1m';
  const limit=Math.min(500,Math.max(20,Number(url.searchParams.get('limit')||240)));
  return json(res,200,{ok:true,interval,candles:await charts.getKlines({interval,limit})});
}
if(p==='/history'&&req.method==='GET') {
  const sinceMs=Number(url.searchParams.get('since')||0);
  const limit=Math.min(5000,Math.max(20,Number(url.searchParams.get('limit')||2000)));
  return json(res,200,{ok:true,...observation.read({sinceMs,limit})});
}
```

- [ ] **Step 8: Verify observation code does not change trading tests**

```bash
cd dkivn/v49
npm test
npm run check
```

Expected: all prior runtime/order tests remain PASS, plus the new observation/Kline tests.

- [ ] **Step 9: Commit**

```bash
git add dkivn/v49/src dkivn/v49/test
git commit -m "feat: add read-only V49 chart data service"
```

---

### Task 3: Build dependency-free chart data/model and Canvas renderer

**Files:**
- Create: `dkivn/v49/console/chart-model.js`
- Create: `dkivn/v49/console/charts.js`
- Create: `dkivn/v49/console/chart-data.js`
- Create: `dkivn/v49/test/chart-model.test.js`
- Create: `dkivn/v49/test/chart-wiring.test.js`
- Modify later in task: `dkivn/v49/package.json`

**Interfaces:**
- `chart-model.js` exports:
  - `normalizeRestCandle(row)`
  - `normalizeWsCandle(message)`
  - `upsertCandle(candles,candle,maxPoints=240)`
  - `extent(values,paddingRatio=.08)`
  - `downsampleSeries(points,maxPoints=240)`
  - `aggregateExecutionMetrics(executions)`
- `charts.js` exports `CandleChart` and `LineChart` classes with `setData()`, `resize()`, and `destroy()`.
- `chart-data.js` exports `MarketChartFeed` and `loadAnalyticsHistory()`.

- [ ] **Step 1: Write failing pure-model tests**

```js
// test/chart-model.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRestCandle,normalizeWsCandle,upsertCandle,aggregateExecutionMetrics} from '../console/chart-model.js';

test('normalizes Toobit REST and WS candles to one shape',()=>{
  assert.deepEqual(normalizeRestCandle([1000,'1','3','0.5','2','10',1999,'20',4,'5','10']),{
    t:1000,open:1,high:3,low:.5,close:2,volume:10,closeTime:1999
  });
  assert.deepEqual(normalizeWsCandle({data:[{t:1000,o:'1',h:'3',l:'.5',c:'2',v:'10'}]}),{
    t:1000,open:1,high:3,low:.5,close:2,volume:10
  });
});

test('upsert replaces current candle instead of duplicating it',()=>{
  const a=upsertCandle([{t:1000,close:1}],{t:1000,close:2});
  assert.equal(a.length,1);
  assert.equal(a[0].close,2);
});

test('execution metrics derive maker volume and fill rate without fabricated values',()=>{
  const m=aggregateExecutionMetrics([
    {status:'FILLED',maker:true,notional:10,side:'BUY'},
    {status:'CANCELED',maker:false,notional:0,side:'SELL'}
  ]);
  assert.equal(m.makerFillNotional,10);
  assert.equal(m.filled,1);
  assert.equal(m.cancelled,1);
});
```

- [ ] **Step 2: Run RED**

```bash
cd dkivn/v49
node --test test/chart-model.test.js
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement pure chart-model functions**

Keep functions deterministic and DOM-free so they can be unit tested in Node.

- [ ] **Step 4: Write chart wiring test before renderer/feed implementation**

```js
// test/chart-wiring.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../console/index.html',import.meta.url),'utf8');
const feed=fs.readFileSync(new URL('../console/chart-data.js',import.meta.url),'utf8');
const renderer=fs.readFileSync(new URL('../console/charts.js',import.meta.url),'utf8');

test('main market chart uses real Kline endpoint and public Kline websocket',()=>{
  assert.match(html,/id="marketChart"/);
  assert.match(feed,/\/market\/klines/);
  assert.match(feed,/wss:\/\/stream\.toobit\.com\/quote\/ws\/v1/);
  assert.match(feed,/kline_\$\{this\.interval\}/);
  assert.doesNotMatch(feed,/sampleData|mockCandle|Math\.random/);
});

test('renderer supports high-DPI Canvas resize and empty states',()=>{
  assert.match(renderer,/devicePixelRatio/);
  assert.match(renderer,/ResizeObserver/);
  assert.match(renderer,/empty/);
});
```

- [ ] **Step 5: Implement native Canvas renderer**

`CandleChart` must draw:
- subtle horizontal gridlines,
- candle wick/body,
- current Fair/Micro/Bot Bid/Bot Ask horizontal overlays,
- execution fill markers,
- a vertical crosshair and compact tooltip on pointer/touch move,
- no axis decoration that competes with price data.

`LineChart` must support multiple named series, semantic line styles, and a quiet empty state.

Use `ResizeObserver` and `window.devicePixelRatio` so the canvas stays sharp without CSS pixel overflow.

- [ ] **Step 6: Implement `MarketChartFeed`**

Flow:

```text
authenticated GET /v49-local/market/klines -> initial 240 real candles
             +
wss://stream.toobit.com/quote/ws/v1 -> kline_<interval> live update
             +
5-second REST refresh only while WebSocket is unavailable
```

Changing timeframe must unsubscribe/close the previous socket before subscribing to the new interval. Supported interval buttons are exactly `1m`, `5m`, `15m`, `1h`.

- [ ] **Step 7: Add new modules to syntax check**

Update `package.json` `check` script to include:

```text
console/chart-model.js
console/charts.js
console/chart-data.js
```

- [ ] **Step 8: Run full tests/check and commit**

```bash
cd dkivn/v49
npm test
npm run check
git add console test package.json
git commit -m "feat: add native V49 chart engine"
```

Expected: PASS.

---

### Task 4: Rebuild the Overview as Apple Stocks × Wallet

**Files:**
- Modify: `dkivn/v49/console/index.html`
- Replace styling: `dkivn/v49/console/app.css`
- Modify: `dkivn/v49/console/app.js`
- Modify: `dkivn/v49/console/controls.js`
- Replace styling: `dkivn/v49/console/controls.css`
- Modify: `dkivn/v49/test/ui-shell.test.js`
- Create: `dkivn/v49/test/apple-overview.test.js`

**Interfaces:**
- Preserve all existing DOM IDs used by runtime/settings/control code.
- Add chart DOM IDs: `marketChart`, `marketChartEmpty`, `marketPriceValue`, `marketTimeframes`, `pnlChart`, `inventoryChart`, `volumeChart`, `qualityChart`.
- Add compact metrics: `effectiveLeverageValue`, `autoSizingValue`, `grossBudgetValue`, `headroomValue`, `marketFreshnessValue`.

- [ ] **Step 1: Write failing Apple Overview contract tests**

```js
// test/apple-overview.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../console/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../console/app.css',import.meta.url),'utf8');

test('overview is chart-first and keeps one primary strategy CTA',()=>{
  for(const id of ['marketChart','marketPriceValue','equityValue','todayPnlValue','strategyState','primaryAction'])
    assert.match(html,new RegExp(`id="${id}"`));
  assert.equal((html.match(/id="primaryAction"/g)||[]).length,1);
  assert.match(html,/data-interval="1m"/);
  assert.match(html,/data-interval="5m"/);
  assert.match(html,/data-interval="15m"/);
  assert.match(html,/data-interval="1h"/);
});

test('Apple visual system is near-black with blue interaction accent',()=>{
  assert.match(css,/--bg:\s*#0{6}/i);
  assert.match(css,/--accent:\s*#0a84ff/i);
  assert.doesNotMatch(css,/--accent:\s*#7fd6b3/i);
});
```

Update `ui-shell.test.js` to retain the existing five-tab, safe-area, one-primary-action, and START-gate contracts while replacing the old `220px` desktop-sidebar expectation with the new compact rail.

- [ ] **Step 2: Run RED**

```bash
cd dkivn/v49
node --test test/ui-shell.test.js test/apple-overview.test.js
```

Expected: FAIL against the current card-heavy UI.

- [ ] **Step 3: Rebuild HTML hierarchy while preserving behavior IDs**

Mobile overview order must be:

```text
Top context / live indicator
Account hero: Equity + Today PnL
4-metric strip: Available / Position / Leverage / Risk
BTCUSDT price + timeframe segmented control
Large market chart
Adaptive Maker state + sizing + primary CTA
Pause / Resume / DISARM / Flat All secondary controls
Public WS / Private WS / API / market freshness health strip
```

Desktop overview at >=980px must use a ~70/30 layout: chart left, account/strategy rail right; analytics row below.

Use inline SVG navigation icons only; no icon dependency.

- [ ] **Step 4: Replace the visual system in `app.css`**

Required tokens:

```css
:root{
  --bg:#000000;
  --surface:rgba(255,255,255,.045);
  --surface-raised:rgba(255,255,255,.075);
  --text:#f5f5f7;
  --secondary:#8e8e93;
  --divider:rgba(255,255,255,.08);
  --accent:#0a84ff;
  --positive:#30d158;
  --warning:#ff9f0a;
  --danger:#ff453a;
}
```

Do not put borders around every section. Use spacing, type scale, and tonal surfaces for hierarchy. Keep tabular numerals on all trading values.

- [ ] **Step 5: Integrate chart feed and live overlays in `app.js`**

After login/bootstrap, instantiate `MarketChartFeed` and `CandleChart`. Every local-status refresh updates overlays from:

```js
{
  fair:lastLocal.fairPrice,
  micro:lastLocal.market?.microPrice,
  bid:lastLocal.quotes?.bid?.price,
  ask:lastLocal.quotes?.ask?.price
}
```

Display sizing from `lastLocal.sizing` without changing the strategy engine.

- [ ] **Step 6: Convert controls from injected engineering buttons to native-looking secondary actions**

Keep IDs and endpoints unchanged. UI labels may be localized, but the behavior remains:
- Pause -> `/strategy/pause`
- Resume -> `/strategy/resume`
- DISARM -> `/strategy/disarm`
- Flat All -> `/position/flash-close`

`RECOVERING`/desired RUNNING copy becomes `MM ENGINE · 連線恢復中`; do not show `AUTO RUN · 自動恢復中`.

- [ ] **Step 7: Run tests/check and commit**

```bash
cd dkivn/v49
npm test
npm run check
git add console test
git commit -m "feat: rebuild V49 Apple chart-first overview"
```

Expected: PASS.

---

### Task 5: Redesign Strategy, Orders, Risk, and More without removing capability

**Files:**
- Modify: `dkivn/v49/console/index.html`
- Modify: `dkivn/v49/console/app.css`
- Modify: `dkivn/v49/console/app.js`
- Modify: `dkivn/v49/console/controls.js`
- Modify: `dkivn/v49/test/strategy-editor-ui.test.js`
- Modify: `dkivn/v49/test/controls.test.js`
- Modify: `dkivn/v49/test/local-ui-wiring.test.js`
- Create: `dkivn/v49/test/analytics-surfaces.test.js`

**Interfaces:**
- Strategy settings IDs and `/v49-settings/` behavior remain unchanged.
- Orders use `/v49-local/orders` for live orders and `/v49-local/history` for observed execution history.
- Risk/analytics charts consume `/v49-local/history` snapshots/executions only.
- More page keeps API bind/delete and existing Funding/Arbitrage/Exchange/Diagnostics entry points.

- [ ] **Step 1: Write failing analytics-surface tests**

```js
// test/analytics-surfaces.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../console/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../console/app.js',import.meta.url),'utf8');

test('PnL inventory volume and MM quality surfaces all exist',()=>{
  for(const id of ['pnlChart','inventoryChart','volumeChart','qualityChart'])
    assert.match(html,new RegExp(`id="${id}"`),id);
});

test('orders show both live orders and observed execution history',()=>{
  assert.match(html,/id="liveOrders"/);
  assert.match(html,/id="orderHistory"/);
  assert.match(js,/\/history/);
});
```

- [ ] **Step 2: Run RED**

```bash
cd dkivn/v49
node --test test/strategy-editor-ui.test.js test/controls.test.js test/local-ui-wiring.test.js test/analytics-surfaces.test.js
```

Expected: analytics tests FAIL; existing functional contracts remain visible.

- [ ] **Step 3: Rebuild Strategy page as two tiers**

Tier 1: mode, Fair, Micro, imbalance, inventory, effective leverage, AUTO sizing, gross budget, headroom.

Tier 2: grouped inline-value settings. Preserve these exact input IDs:

```text
quoteNotionalInput
baseSpreadInput
minEdgeInput
inventoryRiskInput
capitalUtilInput
leverageInput
requoteInput
quoteLifeInput
orderAgeInput
dailyLossInput
dualSideMaxLevInput
monthlyTargetInput
saveStrategySettings
```

Avoid boxed form fields where possible; use grouped rows with subtle dividers.

- [ ] **Step 4: Rebuild Orders page**

Mobile: stacked order rows with no horizontal scroll.

Desktop: aligned table columns:

```text
Side | Position | Price | Size | POST_ONLY | Age | Status
```

Secondary expandable detail contains clientOrderId. History section maps execution statuses to Filled / Cancelled / Partial / Rejected and never fabricates missing fee/PnL values.

- [ ] **Step 5: Rebuild Risk page with PnL and Inventory charts**

Always show numeric values beside charts so critical information is not hover-only:

```text
Leverage
Long
Short
Gross exposure
Liquidation / distance
uPnL
Daily PnL
Risk rate
```

Below, show Public WS, Private WS, market freshness, API errors, executor state, last stop reason.

- [ ] **Step 6: Rebuild More as native-settings style list**

Keep Tokyo Trading API panel. Keep password inputs and in-memory token behavior; do not persist API credentials in browser storage.

Funding/Arbitrage, Exchange management, API Diagnostics, and System settings remain discoverable entries.

- [ ] **Step 7: Wire PnL/Inventory/Volume/MM Quality charts**

Load history after login and every 10 seconds:

```js
const history=await localCall('/history?limit=5000');
```

Use pure chart-model functions to derive:
- PnL time series from snapshots,
- Long/Short/Net/Gross inventory from snapshots,
- maker fill volume and buy/sell split from executions,
- fill/cancel counts and ratios from executions.

If a metric cannot be derived, render `—` and the quiet empty-state message `尚未累積足夠資料`; never substitute sample values.

- [ ] **Step 8: Run full suite/check and commit**

```bash
cd dkivn/v49
npm test
npm run check
git add console test
git commit -m "feat: redesign V49 strategy orders risk and more"
```

Expected: PASS.

---

### Task 6: Add plain-language state copy, accessibility, and responsive hardening

**Files:**
- Create: `dkivn/v49/console/status-copy.js`
- Modify: `dkivn/v49/console/app.js`
- Modify: `dkivn/v49/console/controls.js`
- Modify: `dkivn/v49/console/app.css`
- Create: `dkivn/v49/test/status-copy.test.js`
- Create: `dkivn/v49/test/responsive-contract.test.js`
- Modify: `dkivn/v49/package.json`

**Interfaces:**
- `status-copy.js` exports `humanizeRuntimeState(state,reason)` and `semanticTone(state,reason)`.

- [ ] **Step 1: Write failing status-copy tests**

```js
// test/status-copy.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {humanizeRuntimeState} from '../console/status-copy.js';

test('engineering runtime codes map to plain Traditional Chinese',()=>{
  assert.equal(humanizeRuntimeState('RECOVERING','PRIVATE_WS_OFFLINE').label,'帳戶連線恢復中');
  assert.equal(humanizeRuntimeState('RISK_REDUCE','INVENTORY_HARD_LIMIT').label,'正在降低曝險');
  assert.equal(humanizeRuntimeState('DISARMED','API_ERROR_STREAK').label,'交易 API 異常，已停止');
  assert.equal(humanizeRuntimeState('DISARMED','MARKET_STALE').label,'行情暫時中斷');
});
```

- [ ] **Step 2: Write failing responsive contract test**

```js
// test/responsive-contract.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=fs.readFileSync(new URL('../console/app.css',import.meta.url),'utf8');

test('mobile and desktop contracts prevent overflow and preserve safe areas',()=>{
  assert.match(css,/overflow-x:\s*hidden/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/@media\s*\(min-width:\s*980px\)/);
  assert.match(css,/grid-template-columns:\s*92px\s+minmax\(0,1fr\)/);
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
```

- [ ] **Step 3: Run RED and implement status copy**

```bash
cd dkivn/v49
node --test test/status-copy.test.js test/responsive-contract.test.js
```

Implement mappings at minimum:

```js
const COPY={
  MARKET_STALE:{label:'行情暫時中斷',tone:'warning'},
  PRIVATE_WS_OFFLINE:{label:'帳戶連線恢復中',tone:'warning'},
  PUBLIC_WS_OFFLINE:{label:'行情連線恢復中',tone:'warning'},
  INVENTORY_HARD_LIMIT:{label:'正在降低曝險',tone:'warning'},
  API_ERROR_STREAK:{label:'交易 API 異常，已停止',tone:'danger'},
  MANUAL_PAUSE:{label:'策略已暫停',tone:'neutral'},
  MANUAL_DISARM:{label:'策略已停止',tone:'neutral'},
  MAKER_ACTIVE:{label:'做市中',tone:'positive'}
};
```

Raw codes remain only in Diagnostics/secondary detail.

- [ ] **Step 4: Harden responsive/accessibility behavior**

CSS requirements:
- 44px minimum primary/secondary touch target,
- 16px minimum form input font on iPhone,
- `max-width:100%` and `min-width:0` on chart containers,
- mobile bottom nav safe-area padding,
- desktop `92px + minmax(0,1fr)` grid at >=980px,
- bounded desktop content width around 1500px,
- `font-variant-numeric:tabular-nums`,
- `prefers-reduced-motion: reduce` disables nonessential transitions.

Canvas elements get `role="img"` and useful `aria-label`; each chart also has a visible numeric summary.

- [ ] **Step 5: Add status module to syntax check, run full suite, commit**

```bash
cd dkivn/v49
npm test
npm run check
git add console test package.json
git commit -m "feat: polish V49 Apple states and responsive UX"
```

Expected: PASS.

---

### Task 7: Deploy rollback-safe Apple Preview to `/v49-apple/`

**Files/paths:**
- Source: `dkivn/v49/console/*`
- Preview destination: `/var/www/dkivn-v47/v49-apple/`
- Existing production UI remains: `/var/www/dkivn-v47/v49/`
- Existing runtime remains: `/opt/dkivn-v49/`

**Interfaces:**
- Preview URL: `https://dkivn-139-162-83-217.nip.io/v49-apple/`
- It continues using the existing absolute endpoints `/v49-local/` and `/v49-settings/`.

- [ ] **Step 1: Run a final fresh-clone verification**

From a clean worktree/clone of `feature/dkivn-v49-product-terminal`:

```bash
cd dkivn/v49
npm test
npm run check
```

Expected: all tests PASS, no uncommitted source modifications.

- [ ] **Step 2: Verify live runtime state before static deployment**

Record without modifying:

```bash
systemctl status dkivn-v49-control.service --no-pager
cat /etc/dkivn-v49/run-state.json
curl -fsS http://127.0.0.1:9490/health
```

Also query authenticated status/open orders through the existing UI/API flow and record current `desiredState`, position values, and bot-order count. This is the pre-deployment comparison baseline.

- [ ] **Step 3: Copy only static console assets to preview**

```bash
sudo rm -rf /var/www/dkivn-v47/v49-apple.new
sudo mkdir -p /var/www/dkivn-v47/v49-apple.new
sudo cp -a dkivn/v49/console/. /var/www/dkivn-v47/v49-apple.new/
sudo rm -rf /var/www/dkivn-v47/v49-apple
sudo mv /var/www/dkivn-v47/v49-apple.new /var/www/dkivn-v47/v49-apple
```

Do not restart `dkivn-v49-control.service` for a static-only preview deployment.

- [ ] **Step 4: Verify preview HTTP/assets and auth boundaries**

```bash
curl -fsSI https://dkivn-139-162-83-217.nip.io/v49-apple/
curl -fsSI https://dkivn-139-162-83-217.nip.io/v49-apple/app.css
curl -fsSI https://dkivn-139-162-83-217.nip.io/v49-apple/charts.js
curl -sS -o /dev/null -w '%{http_code}\n' https://dkivn-139-162-83-217.nip.io/v49-local/status
```

Expected:
- Preview/assets: HTTP 200.
- Unauthenticated `/v49-local/status`: HTTP 401.

- [ ] **Step 5: Verify static deployment caused zero trading-state changes**

Compare against Step 2:
- `dkivn-v49-control.service` still ACTIVE,
- `NRestarts` unchanged,
- `desiredState` unchanged,
- positions unchanged except legitimate market/fill activity already in progress before deployment,
- no new DKV49M_ order may be attributed solely to loading or deploying the preview UI.

- [ ] **Step 6: Manual visual verification**

Check at minimum:
- iPhone-like 390px viewport: no horizontal overflow, chart fills width, bottom nav respects safe area, all controls >=44px.
- 430px viewport: no card/text collisions.
- 1440px desktop: compact 92px left rail, ~70/30 chart/control composition, no excessive empty width.
- Market timeframe changes 1m/5m/15m/1h show real Toobit candles.
- Chart empty states are calm and explicit if observation history is not yet populated.
- START/Pause/Resume/DISARM/Flat All still call the existing Tokyo endpoints.

- [ ] **Step 7: Present preview URL for user approval**

Provide only after all automated and operational checks pass:

```text
https://dkivn-139-162-83-217.nip.io/v49-apple/
```

Do not promote automatically.

- [ ] **Step 8: Commit any preview-only fixes after rerunning tests**

```bash
cd dkivn/v49
npm test
npm run check
git add console test src package.json
git commit -m "fix: finalize V49 Apple preview"
```

Skip the commit only when there were no changes after preview validation.

---

### Task 8: Promote approved Apple UI to `/v49/` with immediate rollback path

**Files/paths:**
- Approved preview: `/var/www/dkivn-v47/v49-apple/`
- Production static UI: `/var/www/dkivn-v47/v49/`
- Rollback directory format: `/var/www/dkivn-v47/v49-rollback-YYYYMMDD-HHMMSS/`

**Interfaces:**
- Final URL stays: `https://dkivn-139-162-83-217.nip.io/v49/`
- Runtime/control URLs stay unchanged.

- [ ] **Step 1: Require explicit user approval of `/v49-apple/`**

Do not execute any production-static replacement until the user explicitly approves the preview appearance and behavior.

- [ ] **Step 2: Re-run final source and runtime checks immediately before promotion**

```bash
cd dkivn/v49
npm test
npm run check
systemctl status dkivn-v49-control.service --no-pager
cat /etc/dkivn-v49/run-state.json
```

Record current `desiredState`, positions, and open bot orders.

- [ ] **Step 3: Make timestamped rollback copy and atomically replace static UI**

```bash
STAMP=$(date -u +%Y%m%d-%H%M%S)
sudo cp -a /var/www/dkivn-v47/v49 "/var/www/dkivn-v47/v49-rollback-$STAMP"
sudo rm -rf /var/www/dkivn-v47/v49.new
sudo cp -a /var/www/dkivn-v47/v49-apple /var/www/dkivn-v47/v49.new
sudo rm -rf /var/www/dkivn-v47/v49
sudo mv /var/www/dkivn-v47/v49.new /var/www/dkivn-v47/v49
```

No runtime service restart is required for the static UI promotion.

- [ ] **Step 4: Verify final URL and controls**

```bash
curl -fsSI https://dkivn-139-162-83-217.nip.io/v49/
curl -fsSI https://dkivn-139-162-83-217.nip.io/v49/app.css
curl -fsSI https://dkivn-139-162-83-217.nip.io/v49/charts.js
```

Expected: HTTP 200.

Authenticated smoke test must verify:
- status reads,
- Kline history reads,
- observation history reads,
- settings load/save UI remains functional,
- lifecycle buttons remain wired.

Do not issue START or Flat All solely for deployment verification.

- [ ] **Step 5: Verify trading state did not change because of promotion**

Compare the pre-promotion snapshot:
- service ACTIVE,
- `NRestarts` unchanged,
- desired state unchanged,
- no unexpected new DKV49M_ order,
- positions not modified by deployment.

- [ ] **Step 6: Document rollback command and retain the backup**

If a UI regression is found, rollback without touching the executor:

```bash
sudo rm -rf /var/www/dkivn-v47/v49
sudo cp -a /var/www/dkivn-v47/v49-rollback-<approved-stamp> /var/www/dkivn-v47/v49
```

Keep the rollback copy until the Apple UI has been stable through at least one complete live test session.

---

## Plan Self-Review

- Spec coverage: Overview, all five charts, Strategy, Orders, Risk, More, mobile, desktop, plain-language states, accessibility, real Kline data, lifecycle controls, settings, API binding, preview, and rollback each map to a task above.
- Production-safety gap closed: Task 1 explicitly synchronizes the production-newer runtime before any redesign code can be deployed.
- No fabricated data path exists: market candles come from Toobit REST/WS; app analytics come only from observed runtime/execution events.
- Hot-path isolation is explicit: observation callbacks are synchronous, non-awaiting, bounded in-memory operations; Kline/history endpoints are read-only.
- Type/interface consistency: `/market/klines` and `/history` are produced in Task 2 and consumed in Tasks 3–5; chart model/renderer interfaces are produced in Task 3 and consumed in Tasks 4–5.
- Deployment is rollback-safe: preview is `/v49-apple/`, production `/v49/` is changed only after explicit approval.
- Placeholder scan: no TBD/TODO/“implement later” steps remain.
