# DKIVN VNext — System Design Specification

Date: 2026-09-23  
Status: Design approved in conversation; written specification pending user review  
Scope: Production architecture for DKIVN dual-exchange market-making, hedging, research, backtesting, telemetry, alerting, and strategy governance.

---

## 1. Purpose

DKIVN VNext restructures the current trading system into isolated production services so that:

1. Live trading continues even if the web console is redeployed, crashes, or loses connectivity.
2. Strategy logic can evolve without rewriting exchange connectivity, truth reconciliation, or the dashboard.
3. Backtests and live trading use the same pure strategy logic.
4. Every dashboard card is backed by real source data, never fabricated UI state.
5. The system measures not only PnL and volume, but execution quality: markout, queue quality, toxicity, churn, coverage, ownership, and latency.
6. Strategy parameter changes are versioned and pass through Draft -> Backtest -> Shadow -> Canary -> Live.
7. Toobit and Bitget remain independently operable and independently fail-closed.

The system optimizes for quote quality, execution quality, risk-adjusted net economics, and reliable trading operations. It must not manufacture self-trades, wash trades, or bypass exchange controls.

---

## 2. Top-Level Architecture

The production system is split into three codebases plus one research/analytics worker.

### 2.1 dkivn-engine

Purpose: live execution only.

Responsibilities:

- Public market WebSocket ingress.
- Private user/order/position WebSocket ingress.
- Local L2 book.
- Microstructure features: OBI, OFI, microprice, depth slope, depth velocity, taker intensity.
- Strategy plugins.
- Strategy Governor.
- Inventory and risk.
- Planner.
- Mutation Gateway.
- Order lifecycle / fencing.
- Position ownership and coverage.
- Exchange Truth reconciliation.
- Latency telemetry production.
- Fail-closed runtime state.

The engine MUST NOT render UI and MUST NOT depend on the console process.

### 2.2 dkivn-console

Purpose: operator control plane and monitoring UI.

Technology target:

- Next.js.
- TypeScript.
- shadcn/ui.
- White, high-density operational design.
- Geist / system typography.
- No decorative animation in critical monitoring paths.

Responsibilities:

- Dashboard.
- Venue status.
- Symbol operating table.
- Alert Center.
- Strategy Config editor.
- Backtest Lab.
- Strategy versions.
- Shadow / Canary / Live promotion.
- Daily PnL, volume, wear and rebate reporting.
- Historical charts.

The console MUST NOT hold exchange API credentials and MUST NOT call exchange mutation APIs.

### 2.3 dkivn-contracts

Purpose: single source of truth for cross-service data contracts.

Contains:

- TypeScript schemas.
- Runtime validation schemas.
- Stable numeric/string enums.
- API request / response DTOs.
- IPC command contracts.
- Telemetry contracts.
- Alert contracts.
- StrategyConfig contracts.
- Backtest result contracts.
- Database semantic definitions.

Changes to a contract are versioned and backward-compatible unless explicitly declared breaking.

### 2.4 dkivn-research

Purpose: non-live analytics and simulation.

Responsibilities:

- DuckDB / PyArrow / Parquet pipeline.
- Symbol scanner.
- Fast Backtest.
- Execution Replay Backtest.
- Parameter search.
- Daily analytics.
- Markout calibration.
- Queue-model calibration.
- Strategy/live drift reports.

Python is allowed here because this process is outside the tick-to-trade hot path.

---

## 3. Physical Isolation

Live execution and UI must be separate operating-system processes and separately deployable artifacts.

Minimum production topology:

```text
dkivn-engine
  ├─ toobit-lane
  ├─ bitget-lane
  ├─ truth-reconcile
  └─ telemetry-producer

dkivn-control-api
dkivn-telemetry-collector
dkivn-console
dkivn-research
postgresql
```

A console deployment MUST NOT restart:

- Toobit Public WS.
- Toobit Private WS.
- Bitget Public WS.
- Bitget Private WS.
- Order mutation processes.
- Position reconciliation.
- Strategy state.

A live-engine deployment MUST NOT require a console deployment.

---

## 4. Process and CPU Layout

Suggested 8-core logical layout when the host topology permits:

- Core 0: OS / system services.
- Core 1: Toobit ingress.
- Core 2: Toobit strategy + execution.
- Core 3: Bitget ingress.
- Core 4: Bitget strategy + execution.
- Core 5: truth / reconciliation / control IPC.
- Core 6: telemetry collector / control API.
- Core 7: journal / analytics feeder.

CPU affinity is an optimization, not a correctness dependency.

Affinity must be applied at process or worker-thread level only after runtime profiling proves the layout is beneficial.

The system MUST continue safely if affinity is unavailable.

---

## 5. Communication Model

### 5.1 Control commands

Control commands are low frequency and must never execute inside the market-data hot path.

Transport:

- Unix Domain Socket on the trading host.
- Length-prefixed frame.
- Versioned command envelope.
- Local filesystem permissions restrict access to the control-api service account.

Command flow:

```text
Console
  -> HTTPS
Control API
  -> validate / authorize / persist config
  -> UDS command
Engine Control Plane
  -> validate generation/version
  -> prepare immutable config snapshot
  -> atomic reference swap between strategy evaluations
```

There is no engine restart and no WebSocket reconnect for a normal StrategyConfig update.

### 5.2 Telemetry

The live strategy thread never writes directly to PostgreSQL.

Hot path behavior:

1. Write metrics/events into a bounded in-memory ring.
2. A non-hot-path telemetry worker drains the ring.
3. Telemetry worker sends batched frames to the Telemetry Collector.
4. Collector persists normalized records to PostgreSQL.
5. Collector publishes read-model updates to the Control API / Console.

If the telemetry pipeline is unavailable:

- trading continues when trading truth remains healthy;
- telemetry drop counters increment;
- bounded queues must not grow without limit;
- P1 alert is raised after configured degradation threshold.

### 5.3 Redis

Redis is NOT required in the VNext live critical path.

If introduced later, it may be used for:

- UI fan-out.
- transient read caches.
- research job coordination.

It must never be required to place, cancel, reconcile, or protect a live position.

---

## 6. Database Decision

Primary durable store: PostgreSQL.

Reasons:

- multiple writers;
- long-lived telemetry;
- strategy version history;
- alert history;
- daily aggregates;
- backtest results;
- concurrent console queries;
- future partitioning / retention.

SQLite is allowed only for:

- local development;
- ephemeral cache;
- isolated research notebooks;
- emergency offline tooling.

SQLite is not the production source of truth.

---

## 7. dkivn-contracts Core Schemas

All timestamps exposed to services use UTC wall-clock timestamps for history plus monotonic timestamps where latency ordering matters.

### 7.1 Venue

```ts
type Venue = "TOOBIT" | "BITGET";
```

### 7.2 RuntimeState

```ts
type RuntimeState =
  | "STOPPED"
  | "READY"
  | "RUNNING"
  | "PAUSED"
  | "RISK_REDUCE"
  | "RECOVERING"
  | "DISARMED";
```

### 7.3 OrderLifecycleState

```ts
type OrderLifecycleState =
  | "IDLE"
  | "PENDING_CREATE"
  | "ACTIVE"
  | "PARTIAL"
  | "PENDING_CANCEL"
  | "PENDING_AMEND"
  | "UNKNOWN"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED"
  | "FAILED";
```

### 7.4 StrategyMode

```ts
type StrategyMode =
  | "HYBRID_MM"
  | "ADAPTIVE_GRID"
  | "CROSS_VENUE_ARB"
  | "INVENTORY_REDUCE";
```

### 7.5 MarketRegime

```ts
type MarketRegime =
  | "RANGE"
  | "TREND_UP"
  | "TREND_DOWN"
  | "VOLATILE"
  | "TOXIC"
  | "UNKNOWN";
```

---

## 8. StrategyConfig

Strategy configuration is immutable after publication.

Every edit creates a new version.

Required metadata:

```ts
interface StrategyConfigEnvelope {
  id: string;
  version: string;
  generation: bigint;
  createdAt: string;
  createdBy: string;
  status: "DRAFT" | "BACKTESTED" | "SHADOW" | "CANARY" | "LIVE" | "RETIRED";
  venueScope: Venue[];
  symbolScope: string[];
  checksum: string;
  config: StrategyConfig;
}
```

Core fields:

```ts
interface StrategyConfig {
  strategyMode: StrategyMode;

  quote: {
    baseNotionalUsdt: number;
    levels: number;
    maxOrdersPerSymbol: number;
    minQuoteLifeMs: number;
    requoteThresholdBps: number;
    postOnly: true;
  };

  inventory: {
    targetNetUsdt: number;
    softLimitUsdt: number;
    hardLimitUsdt: number;
    maxGrossUsdt: number;
  };

  hybridMm: {
    baseGamma: number;
    gammaToxicityMultiplier: number;
    gammaInventoryMultiplier: number;
    minHalfSpreadBps: number;
    minExpectedEvBps: number;
    toxicityHardStop: number;
    markoutWindowMs: number;
  };

  grid: {
    enabled: boolean;
    spacingMode: "FIXED" | "VOLATILITY";
    fixedSpacingBps: number;
    maxLevels: number;
    positionThresholdUsdt: number;
  };

  crossVenue: {
    enabled: boolean;
    makerVenue: Venue;
    hedgeVenue: Venue;
    minNetSpreadBps: number;
    fillTimeoutMs: number;
    maxHedgeLagMs: number;
  };

  risk: {
    maxDailyLossUsdt: number;
    maxApiErrorStreak: number;
    maxMarketAgeMs: number;
    maxPrivateWsAgeMs: number;
    maxTruthAgeMs: number;
    maxCoverageDeficitUsdt: number;
  };
}
```

Server-side validation MUST reject unsafe combinations before publication.

---

## 9. Configuration Promotion Workflow

```text
DRAFT
  ↓
FAST BACKTEST
  ↓
EXECUTION REPLAY
  ↓
SHADOW
  ↓
CANARY
  ↓
LIVE
```

### Draft

Editable. No engine authority.

### Backtested

Has a reproducible backtest result tied to:

- strategy checksum;
- dataset version;
- simulator version;
- fee/rebate model version.

### Shadow

Runs on live data with mutationAuthority=false.

Stores:

- proposed quotes;
- predicted fills;
- predicted EV;
- legacy/live comparison;
- predicted avoided toxic fills.

### Canary

Limited by:

- venue;
- symbol;
- notional;
- order count;
- duration.

### Live

Engine receives a generation-fenced immutable config.

Rollback creates a new generation pointing to an older known-good config. It does not mutate historical records.

No redundant double-confirm modal is required. A single operator action may promote a validated config, but the server MUST perform readiness and policy checks atomically before accepting it.

---

## 10. Strategy Governor

The Strategy Governor is the only strategy-level authority selector.

It decides which plugin can propose quotes for a symbol/venue.

Possible policy:

### RANGE

- HYBRID_MM: enabled.
- ADAPTIVE_GRID: enabled when score passes.
- CROSS_VENUE_ARB: enabled when net spread passes.
- INVENTORY_REDUCE: dormant unless inventory demands it.

### TREND

- ADAPTIVE_GRID: disabled.
- HYBRID_MM: defensive / wider.
- CROSS_VENUE_ARB: allowed.
- INVENTORY_REDUCE: allowed.

### TOXIC

- inventory-adding maker quotes: disabled.
- Grid: disabled.
- reduce-only / hedge actions: permitted.
- strategy waits for toxicity recovery.

A plugin cannot bypass:

- Risk Engine.
- Coverage.
- Ownership.
- Truth freshness.
- Mutation fencing.

---

## 11. Hybrid-MM Strategy

Hummingbot is a mathematical reference, not the runtime.

Borrowed concepts:

- Avellaneda-Stoikov reservation price.
- risk gamma.
- volatility.
- trading intensity / kappa.
- inventory skew.
- order refresh tolerance.
- executor lifecycle separation.

DKIVN-specific decision order:

```text
Truth health
-> Market freshness
-> Fair value
-> A-S reservation/spread
-> Inventory skew
-> Toxicity / expected markout
-> Queue quality / fill probability
-> Expected maker EV
-> Churn gate
-> Planner
```

Expected maker EV:

```text
EV =
P(fill) × (
  maker rebate
  + expected spread capture
  - expected markout cost
)
- inventory cost
- latency cost
- queue penalty
```

A-S does not directly place or cancel orders.

---

## 12. Adaptive Grid Strategy

Clean-room logic inspired by public grid implementations and FMZ research.

Do not copy unlicensed or AGPL implementation code into proprietary DKIVN modules.

Inputs:

- Market regime.
- Realized volatility.
- Parkinson volatility.
- amplitude.
- mean reversion score.
- spread.
- depth.
- toxicity.
- inventory.

Grid behavior:

- dynamic spacing;
- bounded number of levels;
- independent long/short inventory accounting;
- hard position threshold;
- no martingale by default;
- no doubling after adverse inventory;
- automatic shutdown during directional trend or toxicity.

Grid spacing:

```text
spacingBps =
clamp(
  baseSpacing
  + volatilityAdjustment
  + toxicityAdjustment
  + inventoryAdjustment,
  minSpacing,
  maxSpacing
)
```

---

## 13. Cross-Venue Arb / Hedge Strategy

Clean-room architecture inspired by cross-exchange arbitrage frameworks.

Core pattern:

```text
Maker venue
  -> passive fill
  -> hedge lease acquired
  -> hedge venue execution
  -> delta check
  -> release lease
```

Required controls:

- maker/hedge venue abstraction;
- maximum position;
- fill timeout;
- hedge timeout;
- max hedge lag;
- minimum net spread after fees and slippage;
- no duplicate hedge for one maker fill;
- HEDGE_LEASE_READY gate;
- exchange-independent clientOrderId / mutation generation.

Cross-venue strategy must use the same Truth / Coverage / Ownership infrastructure as market making.

---

## 14. Symbol Scanner

Runs outside the live engine on an hourly cadence by default.

Candidate score:

```text
SymbolScore =
w1 * Amplitude
+ w2 * RealizedVolatility
+ w3 * Turnover
+ w4 * MeanReversion
+ w5 * SpreadQuality
+ w6 * DepthQuality
- w7 * Toxicity
- w8 * ExpectedMarkout
- w9 * TrendPenalty
- w10 * LatencyPenalty
```

Inputs must be normalized to comparable ranges before weighting.

### Parkinson volatility

For high/low observations:

```text
sigma²_P =
1 / (4 ln 2) *
mean(
  ln(H_t / L_t)^2
)
```

### Mean reversion

Hurst exponent may be used as one feature, not as the sole regime classifier.

Interpretation:

- H < 0.5: stronger anti-persistence / mean-reversion tendency.
- H ~ 0.5: random-walk-like.
- H > 0.5: stronger persistence / trend tendency.

The scanner must combine Hurst with:

- directional return.
- realized volatility.
- order-book toxicity.
- spread/depth.

### Scanner outputs

For each venue/symbol:

- Grid Score.
- MM Score.
- Arb Score.
- Market Regime.
- 24h turnover.
- spread bps.
- depth.
- toxicity.
- 100/250/500ms markout cost.
- recommended eligible strategy set.

The scanner does not receive live mutation authority.

---

## 15. Backtest Architecture

Strategy code is shared.

Live:

```text
Exchange WS
-> L2 Normalizer
-> Feature Engine
-> Strategy
-> Planner
-> Mutation Gateway
-> Exchange
```

Replay:

```text
Parquet
-> Replay Feed
-> same L2 Normalizer
-> same Feature Engine
-> same Strategy
-> Planner
-> Simulated Gateway
-> Matching Simulator
```

Only the transport/matcher changes.

---

## 16. Fast Backtest

Purpose:

- symbol screening;
- grid spacing search;
- regime parameters;
- broad parameter sweeps.

Input:

- 1-second bars where available;
- otherwise 1-minute OHLCV.

Outputs:

- daily gross PnL;
- estimated fees;
- estimated rebate;
- net PnL;
- turnover;
- max drawdown;
- inventory utilization;
- parameter sensitivity.

Fast Backtest results MUST be labeled approximate and MUST NOT be treated as maker fill truth.

---

## 17. Execution Replay Backtest

Purpose:

- execution realism;
- queue selection;
- toxic fill analysis;
- latency/cancel risk.

Input:

- L2 snapshots/deltas.
- trade tape.
- exchange timestamps.
- local receive timestamps where recorded.
- fee/rebate schedule.
- measured live latency distributions.

### Queue model

At placement:

```text
queueAheadQty =
visible quantity ahead at price level
+ configurable hidden/liquidity uncertainty buffer
```

Queue depletion is estimated from:

- taker executions at the price;
- cancellations ahead;
- additions ahead where observable.

The simulator MUST NOT assume every touch is a fill.

### Conservative fill rule

A full fill is confirmed only when estimated queue depletion reaches our queue position plus order quantity.

Partial fills are modeled when only part of our simulated quantity is reached.

### Cancellation latency

When cancel is issued:

```text
cancelEffectiveTime =
commandTime + sampledCancelLatency
```

Any historical execution that reaches our simulated queue position before cancelEffectiveTime may fill.

This creates explicit:

- CANCEL_RACE_FILL;
- TOXIC_FILL_AFTER_CANCEL_REQUEST.

Latency is sampled from measured per-venue empirical distributions, not a permanent hard-coded 30ms constant.

---

## 18. Backtest Result Contract

```ts
interface BacktestResult {
  id: string;
  strategyVersion: string;
  strategyChecksum: string;
  datasetVersion: string;
  simulatorVersion: string;

  startedAt: string;
  endedAt: string;

  venue: Venue | "MULTI";
  symbols: string[];

  grossPnlUsdt: number;
  feeUsdt: number;
  rebateUsdt: number;
  fundingUsdt: number;
  netPnlUsdt: number;

  tradedVolumeUsdt: number;
  makerVolumeUsdt: number;
  takerVolumeUsdt: number;
  makerRatio: number;

  maxDrawdownUsdt: number;
  maxDrawdownPct: number;

  coreWearBps: number;
  netWearBps: number;

  fills: number;
  cancels: number;
  amendments: number;
  cancelToFill: number;
  ordersPerFill: number;

  adverseFillRatio: number;
  markout50Bps: number;
  markout100Bps: number;
  markout250Bps: number;
  markout500Bps: number;
}
```

---

## 19. Wear Definitions

### 19.1 Fill Markout

For a buy fill:

```text
markout_bps(dt) =
(mid(t + dt) - fillPrice) / mid(t) * 10000
```

For a sell fill:

```text
markout_bps(dt) =
(fillPrice - mid(t + dt)) / mid(t) * 10000
```

Positive is favorable after the fill.

### 19.2 Core Wear

Core Wear is NOT a single-fill markout metric.

Daily Core Wear is the strategy execution loss/gain per traded notional before rebate:

```text
coreWearBps =
10000 *
(
realizedTradingPnl
- tradingFees
- fundingCost
) /
tradedNotional
```

Rebate is excluded.

Markout is shown separately as execution-quality diagnostics.

### 19.3 Net Wear

```text
netWearBps =
10000 *
(
realizedTradingPnl
- tradingFees
- fundingCost
+ rebate
) /
tradedNotional
```

Dashboard must display:

- Core Wear.
- Net Wear.
- Rebate.
- Markout 50/100/250/500ms.

This prevents markout and accounting PnL from being conflated.

---

## 20. Telemetry Contract

Per venue/symbol telemetry includes:

### Market

- bestBid.
- bestAsk.
- spreadBps.
- microPrice.
- OBI.
- OFI.
- depthSlope.
- depthVelocity.
- buyTradeIntensity.
- sellTradeIntensity.
- marketAgeMs.

### Strategy

- strategyMode.
- regime.
- reservationPrice.
- dynamicGamma.
- optimalHalfSpreadBps.
- bidEvBps.
- askEvBps.
- toxicity.
- queueQualityBid.
- queueQualityAsk.
- expectedMarkoutBidBps.
- expectedMarkoutAskBps.
- decisionBid.
- decisionAsk.

### Orders

- activeOrders.
- maxOrders.
- bidOrders.
- askOrders.
- pendingCreate.
- pendingCancel.
- pendingAmend.
- unknownOrders.
- orderRate.
- cancelRate.
- cancelToFill.
- ordersPerFill.

### Inventory

- longQty.
- shortQty.
- longNotionalUsdt.
- shortNotionalUsdt.
- netInventoryUsdt.
- grossInventoryUsdt.
- coverageDeficitUsdt.

### Execution

- todayVolumeUsdt.
- makerVolumeUsdt.
- takerVolumeUsdt.
- makerRatio.
- realizedPnlUsdt.
- feesUsdt.
- rebateUsdt.
- fundingUsdt.
- coreWearBps.
- netWearBps.

### Latency

- recvToParse.
- parseToL2.
- l2ToFeatures.
- featuresToStrategy.
- strategyToRisk.
- riskToSerialize.
- serializeToSend.
- sendToAck.
- ackToPrivateEvent.
- privateEventToTruth.

Each exposes at minimum:

- p50.
- p95.
- p99.
- p99.9.
- max.

Also:

- eventLoopLag.
- gcPause.
- wsAge.
- truthAge.

---

## 21. Alert Event Store

There is one alert source of truth.

UI and Telegram consume the same AlertEvent records.

```ts
interface AlertEvent {
  id: string;
  fingerprint: string;

  level: "P0" | "P1" | "P2";
  venue: Venue | null;
  symbol: string | null;

  type:
    | "POSITION_COVERAGE_DIVERGENCE"
    | "UNKNOWN_ORDER"
    | "SELF_CROSS"
    | "TRUTH_UNSYNCED"
    | "PRIVATE_WS_STALE"
    | "PUBLIC_WS_STALE"
    | "RATE_LIMIT"
    | "NEGATIVE_MARKOUT"
    | "HIGH_TOXICITY"
    | "ORDER_SLOT_SATURATED"
    | "HIGH_CHURN"
    | "LATENCY_DEGRADED"
    | "BACKTEST_LIVE_DRIFT";

  startedAt: string;
  firstSeenMonoNs: bigint;
  lastSeenAt: string;
  ageMs: number;

  rootCauseCode: string;
  summary: string;
  truthSnapshot: Record<string, unknown>;

  automaticAction:
    | "NONE"
    | "HOLD_NEW_ORDERS"
    | "CANCEL_OWNED"
    | "RISK_REDUCE"
    | "DISARM";

  resolvedAt: string | null;
}
```

Monotonic nanoseconds are process-local and are not persisted as the sole historical timestamp.

---

## 22. Alert Policies

### P0

Examples:

- persistent position/coverage divergence;
- unknown order with ownership ambiguity;
- self-cross risk;
- hard inventory breach;
- stale/ambiguous exchange truth;
- mutation fencing failure.

Default action:

- stop inventory-adding mutations;
- cancel bot-owned quotes if required;
- reconcile exchange truth;
- enter RISK_REDUCE or DISARM depending on incident.

Automatic market orders are NOT the default response to every P0. Forced hedge/flatten is allowed only when the risk policy explicitly proves that doing so reduces risk and the exchange truth is sufficiently reliable.

### P1

Examples:

- private WS stale;
- 429 / rate-limit degradation;
- high toxicity;
- order slots saturated;
- latency p99 degradation.

### P2

Examples:

- low fill rate;
- high churn;
- deteriorating expected EV;
- shadow/live model drift.

---

## 23. PostgreSQL Logical Model

Required logical tables:

### strategy_configs

- id.
- version.
- generation.
- status.
- checksum.
- config_json.
- created_at.
- created_by.

### strategy_promotions

- config_id.
- from_status.
- to_status.
- venue_scope.
- symbol_scope.
- promoted_at.
- promoted_by.
- validation_result_json.

### venue_daily_metrics

- day.
- venue.
- equity_open.
- equity_close.
- realized_pnl.
- fees.
- funding.
- rebate.
- traded_volume.
- maker_volume.
- taker_volume.
- core_wear_bps.
- net_wear_bps.

### symbol_daily_metrics

Same as venue metrics plus symbol-level:

- fills.
- cancels.
- order_count.
- max_inventory.
- avg_inventory.
- adverse_fill_ratio.
- markout_50/100/250/500.

### alerts

Persistent AlertEvent record.

### backtest_runs

BacktestResult + parameters + artifacts.

### strategy_shadow_decisions

Sampled/aggregated comparison between active strategy and shadow strategy.

Raw high-frequency telemetry must be retained with a bounded policy and should be partitioned or written to Parquet rather than kept indefinitely in OLTP tables.

---

## 24. Parquet / Historical Data

High-frequency history is stored as Parquet partitioned by:

```text
venue=<venue>/
symbol=<symbol>/
date=<yyyy-mm-dd>/
stream=<l2|trades|orders|latency>/
```

Parquet is the primary replay input.

PostgreSQL stores:

- file manifest;
- dataset version;
- min/max timestamps;
- checksum;
- row counts;
- data quality status.

No backtest may claim reproducibility without a dataset version.

---

## 25. Console Information Architecture

Primary navigation:

1. Overview.
2. Venues.
3. Symbols.
4. Strategy.
5. Backtest Lab.
6. Alerts.
7. History.
8. System.

### Overview

Cards:

- Total Equity.
- Today Realized PnL.
- Today Volume.
- Maker Ratio.
- Rebate.
- Core Wear.
- Net Wear.
- Markout 500ms.
- Active P0/P1 alerts.

Venue cards:

- Toobit.
- Bitget.

Each displays only real runtime telemetry.

### Symbols Operating Table

Required columns:

- Symbol.
- Venue.
- Strategy.
- Regime.
- Active Orders / Max Orders.
- Long Inventory.
- Short Inventory.
- Net Inventory.
- Today Volume.
- Maker Ratio.
- Bid EV.
- Ask EV.
- Toxicity.
- Markout 500ms.
- Alert state.

### Symbol Detail Drawer

Shows:

- L2 top levels.
- active bot-owned orders.
- position.
- coverage.
- queue estimates.
- fill rate.
- cancel/fill.
- orders/fill.
- OTR-like operational ratio.
- bid/ask EV.
- toxicity.
- dynamic gamma.
- reservation price.
- last fills.
- markout timeline.
- active alerts.

---

## 26. Strategy Control Center

Editable UI fields map exactly to StrategyConfig.

The console MUST show:

- current LIVE version;
- draft version;
- effective venue/symbol scope;
- diff against LIVE;
- validation errors;
- latest Fast Backtest;
- latest Replay Backtest;
- Shadow result;
- Canary result.

Publishing does not mutate the previous version.

Rollback is a new promotion event.

---

## 27. Backtest Lab UI

Inputs:

- strategy version.
- venue.
- symbols.
- date range.
- capital.
- leverage.
- fee/rebate model.
- latency profile.
- parameter overrides.

Outputs:

- cumulative PnL.
- daily PnL.
- daily volume.
- volume by venue.
- volume by symbol.
- maker/taker ratio.
- Core Wear.
- Net Wear.
- rebate.
- fees.
- drawdown.
- inventory.
- fill rate.
- cancel/fill.
- orders/fill.
- adverse-fill ratio.
- markout horizons.

Comparison mode supports:

- Legacy vs Hybrid-MM.
- Hybrid-MM parameter A vs B.
- Grid vs Hybrid-MM.
- Shadow vs Live.

---

## 28. API Boundary

Console-facing API is read/control-plane only.

Allowed command categories:

- create draft config.
- update draft config.
- start backtest.
- start shadow evaluation.
- promote validated config.
- rollback config.
- START venue.
- PAUSE quoting.
- RESUME.
- DISARM.
- emergency cancel-owned.
- emergency flatten only through explicit risk endpoint.

No generic arbitrary order endpoint is exposed to the web application.

The engine remains the only component holding mutation authority.

---

## 29. Exchange Isolation

Toobit and Bitget maintain independent:

- runtime state;
- market-data state;
- private WS state;
- mutation generation;
- order namespace;
- rate limiter;
- position ownership;
- coverage;
- strategy authority;
- alert state.

A failure in one venue MUST NOT automatically stop the other unless a cross-venue strategy creates explicit dependency and the Strategy Governor declares the dependency unsafe.

---

## 30. Client Order IDs and Fencing

Every live mutation is tied to:

- venue.
- engine instance.
- strategy generation.
- symbol.
- side.
- monotonic sequence.

The exact encoding must stay within exchange limits.

Local lifecycle begins before sending:

```text
PLANNED
-> PENDING_CREATE
-> ACK / UNKNOWN
-> ACTIVE / REJECTED
-> PARTIAL
-> FILLED / PENDING_CANCEL / CANCELLED
```

UNKNOWN never triggers blind duplicate placement.

Truth reconciliation resolves ambiguity.

---

## 31. Rate Governance

Rate limits are exchange-specific.

Gateway tracks:

- request rate.
- order rate.
- cancel rate.
- orders/fill.
- cancels/fill.
- rejects.
- 429s.
- UNKNOWN ACK rate.

Operational churn bands may be configured, but must not be labeled as official exchange OTR limits unless the exchange explicitly documents them.

Rate governance priority:

1. safety / reduce-risk mutations.
2. reconciliation.
3. cancels required for safety.
4. normal quote placement.
5. discretionary quote replacement.

---

## 32. Failure Semantics

### Console unavailable

- Live engine continues.
- Existing config remains active.
- Telegram alerts continue through alert worker.
- No config changes possible until control plane recovers.

### PostgreSQL unavailable

- Engine continues if truth/risk is healthy.
- Control API becomes read-degraded/write-disabled.
- Telemetry collector buffers only to bounded local journal.
- Config promotion is disabled.

### Telemetry Collector unavailable

- Engine continues.
- Bounded telemetry loss is allowed.
- Trading is not blocked unless monitoring loss exceeds a configured safety policy.

### Control API unavailable

- Trading continues.
- Engine can still fail closed internally.
- Console shows offline/control unavailable.

### Private WS unavailable

Venue-specific risk policy enters RECOVERING / DISARM as appropriate. The console cannot override truth safety.

---

## 33. Security

- Exchange secrets exist only in engine/credential service scope.
- Console never receives secrets.
- Database credentials are service-scoped.
- Strategy promotion requires authenticated operator role.
- UDS filesystem permissions restrict command writers.
- Every config promotion and runtime command is audit logged.
- No secret is written into telemetry, alerts, or browser logs.
- CSRF/session protections apply to console mutation routes.
- Emergency endpoints require explicit authorization and cannot be invoked by normal page rendering.

---

## 34. Licensing / Clean-Room Boundary

Public sources are used as references according to license.

- Hummingbot: mathematical/architectural concepts are ported into DKIVN-native code.
- crypto-portfolio-tracker-oss: MIT-licensed patterns/code may be reused only with required attribution/license retention.
- cross-exchange-arbitrage: AGPL code is not copied into proprietary DKIVN modules; architecture is reimplemented clean-room.
- buou_grid: absent an explicit repository license, implementation code is not copied; only independently re-created concepts are used.
- FMZ content: use ideas/formulas; do not reproduce proprietary source verbatim unless license permits.

A THIRD_PARTY_NOTICES file must record any actual reused licensed code.

---

## 35. Testing Strategy

### Contracts

- schema validation.
- backward compatibility.
- serialization round-trip.

### Engine

- replay tests.
- order lifecycle tests.
- ownership tests.
- coverage tests.
- duplicate mutation tests.
- stale-event tests.
- rate-limit tests.
- restart/recovery tests.

### Strategies

- deterministic pure-function tests.
- property tests around inventory limits.
- quote no-cross.
- post-only.
- negative-EV blocking.
- regime transitions.

### IPC

- malformed frame rejection.
- generation fencing.
- stale command rejection.
- atomic config swap.
- reconnect.

### Backtest

- deterministic seed.
- replay reproducibility.
- partial fills.
- queue depletion.
- cancel-race fills.
- latency sampling.
- accounting reconciliation.

### Console

- no fake data fallback.
- explicit loading/unknown states.
- venue independence.
- config diff.
- rollback flow.
- alert resolution.

---

## 36. Production Acceptance Gates

VNext cannot receive full live authority until all gates pass.

### Gate A — Isolation

- Console deploy/restart does not restart engine.
- Engine continues quoting through console outage.
- Venue processes are independent.

### Gate B — Truth

- no unresolved ownership divergence.
- no persistent coverage deficit.
- no duplicate clientOrderId lifecycle.
- recovery replay passes.

### Gate C — Metrics

Dashboard values reconcile against exchange/API truth for:

- positions.
- open orders.
- venue volume.
- realized PnL.
- fees/rebate where available.

### Gate D — Backtest

- Fast Backtest reproducible.
- Execution Replay reproducible.
- backtest datasets versioned.

### Gate E — Shadow

Hybrid-MM / Grid / cross-venue proposals run with mutationAuthority=false and record decisions.

### Gate F — Canary

One symbol / bounded notional / bounded order slots.

### Gate G — Live

Promotion only after preceding gates have fresh evidence.

---

## 37. Initial Delivery Order

The first implementation plan should follow this dependency order:

1. dkivn-contracts.
2. engine/control IPC.
3. telemetry collector.
4. PostgreSQL schema.
5. read-only Overview / Venue / Symbol dashboard.
6. Alert Event Store.
7. strategy config versioning.
8. Fast Backtest.
9. Execution Replay.
10. Symbol Scanner.
11. Hybrid-MM shadow integration.
12. Adaptive Grid shadow integration.
13. Cross-Venue Arb shadow integration.
14. Canary promotion pipeline.
15. full Live promotion.

The website is intentionally built against read models before it gains strategy-control capabilities.

---

## 38. Explicit Non-Goals for First VNext Release

- No Rust/C++ rewrite.
- No ML black-box price predictor.
- No direct browser-to-exchange API.
- No Redis dependency in the trading hot path.
- No cross-account self-trading.
- No martingale default.
- No automatic promotion from backtest directly to Live.
- No claim that OHLC backtests reproduce maker fills.
- No UI-derived runtime truth.

---

## 39. Success Criteria

DKIVN VNext is considered structurally successful when:

1. Website deployments cannot interrupt live strategy execution.
2. Toobit and Bitget are independently startable, pausable, recoverable, and disarmable.
3. Every dashboard metric has a traceable real source.
4. Every strategy change has a version, checksum, promotion history, and rollback path.
5. Daily PnL, volume, maker ratio, Core Wear, Net Wear, fees, rebate and markout are available per venue and symbol.
6. Every symbol exposes active/max orders, long/short/net inventory, EV, toxicity, queue metrics, and alerts.
7. Alert Center and Telegram consume the same Alert Event Store.
8. Backtests use shared strategy logic and versioned datasets.
9. Shadow results can be compared against actual live fills/markout before live promotion.
10. No new strategy can bypass Truth, Coverage, Ownership, Risk, Rate Governance or Mutation Fencing.
