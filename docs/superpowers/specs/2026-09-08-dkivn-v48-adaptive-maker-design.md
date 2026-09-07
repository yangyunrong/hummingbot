# DKIVN V4.8 — Event-Driven Dual-Sided Adaptive Maker Design

Date: 2026-09-08
Status: Approved design, pending implementation-plan approval gate
Target: Toobit BTC-SWAP-USDT on the existing Tokyo Gateway / Supabase control plane

## 1. Purpose

Upgrade the current V4.7 single-cycle inventory maker into a real event-driven passive market-making engine for one exchange (Toobit), using external market interaction rather than volume-for-volume's-sake behavior.

The system MUST optimize for quote quality, fill quality, net edge, and inventory risk. It MUST NOT self-trade, intentionally manufacture volume, or force turnover to satisfy promotional or rebate targets.

## 2. Current Production Baseline

The existing production stack is:

- Tokyo VPS running `/opt/dkivn-gateway/gateway.js` under systemd.
- Supabase Edge Functions as encrypted credential and control bridge.
- Nginx HTTPS console at `https://dkivn-139-162-83-217.nip.io/`.
- Public Toobit `bookTicker` websocket connected.
- Private Toobit user-data websocket connected through listenKey.
- Current strategy mode: `INVENTORY_PASSIVE_MAKER`.
- Current bot client-order prefix: `DKV47M_`.
- Existing hard fail-closed runtime state machine with DISARM behavior.
- Existing Bridge V5 uses form-encoded private POST wire format for Toobit order submission.

V4.8 must preserve all working V4.7 monitoring, diagnostics, credential storage, private websocket, arbitration/funding pages, runtime safety, and manual DISARM functionality.

## 3. External API Contract

Use current Toobit official interfaces:

- Public websocket: `wss://stream.toobit.com/quote/ws/v1`
- Best bid/ask stream: `bookTicker`
- Incremental order-book stream: `diffDepth`
- Futures order create: `POST /api/v2/futures/order`
- Futures regular order update: `POST /api/v2/futures/order/update`
- Futures open orders: `GET /api/v2/futures/open-orders`
- User data stream via listenKey.

V2 regular orders support `LIMIT`, `POST_ONLY`, `BUY/SELL`, `LONG/SHORT`, and `valueQuantity`.

Official references checked 2026-09-08:

- https://api-docs.toobit.com/api/usdt-m-websocket-market-data
- https://api-docs.toobit.com/api/usdt-m-api-v2
- https://api-docs.toobit.com/zh/api/usdt-m-account-and-trading.html

## 4. Architecture

V4.8 is split into independently testable units.

### 4.1 Market Data Engine

Responsibilities:

- Subscribe to `bookTicker`.
- Subscribe to `diffDepth` for BTC-SWAP-USDT.
- Maintain an in-memory top-of-book and shallow order book.
- Track exchange timestamp and local receive timestamp.
- Reject stale or structurally invalid updates.

Outputs:

- bestBid / bestAsk
- bestBidQty / bestAskQty
- midPrice
- microPrice
- depthImbalance
- short-window realized volatility
- marketDataAgeMs

The engine must not make trading decisions.

### 4.2 Fair-Value Engine

Compute a bounded fair price from:

1. Mid price.
2. Microprice derived from top-of-book quantity imbalance.
3. Shallow-depth imbalance adjustment.
4. Short-term volatility filter.

No ML model is required for V4.8. The formula must remain deterministic and explainable.

Initial model:

`microPrice = (ask * bidQty + bid * askQty) / (bidQty + askQty)`

`fairPrice = clamp(microPrice + imbalanceAdjustment, bestBid, bestAsk)`

The imbalance adjustment must be capped so it cannot move fair value outside the current spread.

### 4.3 Inventory Engine

Track separately:

- LONG position quantity/notional
- SHORT position quantity/notional
- net inventory notional
- gross inventory notional
- average entry price by side

Initial production limits for the ~100 USDT available test account:

- Per-side quote notional: 10 USDT.
- Target net inventory: 0 USDT.
- Soft net inventory limit: 10 USDT.
- Hard net inventory limit: 20 USDT.
- Maximum one live bid and one live ask owned by V4.8.

Inventory skew adjusts reservation price and per-side quote aggressiveness.

If net inventory is long:

- Buy quote moves farther away.
- Sell quote moves closer, subject to minimum edge and POST_ONLY guard.

If net inventory is short, apply the inverse.

At hard inventory limit, the engine must stop adding inventory in the same direction and only allow reducing quotes.

### 4.4 Quote Engine

Inputs:

- fair price
- best bid/ask
- volatility
- inventory skew
- maker fee estimate
- adverse-selection buffer

Outputs:

- desired bid price
- desired ask price
- desired bid notional
- desired ask notional

Every quote MUST be passive (`POST_ONLY`).

Initial behavior:

- Maximum 1 bid + 1 ask.
- Baseline per-side quote notional: 10 USDT.
- Requote threshold: max(2 bps, a market-spec-aware minimum tick displacement).
- Minimum quote life: 2.5 seconds before discretionary reprice, except safety events.
- Never cross best opposite quote.
- Never place bid >= own ask.
- Never place ask <= own bid.

The quote engine must not submit API calls itself.

### 4.5 Order Executor

Owns only V4.8 bot orders with prefix:

`DKV48M_`

Responsibilities:

- Create missing passive quotes.
- Prefer order update/amend over cancel-new when supported and safe.
- Cancel stale or invalid bot quotes.
- Reconcile REST open orders against private websocket events.
- Detect lost/unknown orders and fail closed rather than duplicate blindly.

The executor MUST NOT cancel or modify manual user orders.

A bot order is considered owned only if the clientOrderId starts with `DKV48M_`.

### 4.6 Self-Trade / Cross Guard

Before any create or amend:

- Query/reconcile own active bid and ask.
- Reject a desired bid if it would be >= active own ask.
- Reject a desired ask if it would be <= active own bid.
- If state becomes ambiguous, cancel V4.8 bot quotes and DISARM.

No self-trade prevention assumption may be delegated to the exchange.

### 4.7 Private Event Reconciliation

Private websocket events are authoritative for fast order/fill state changes.

REST is authoritative for startup/recovery reconciliation.

On startup/resume:

1. Fetch balances.
2. Fetch positions.
3. Fetch open orders.
4. Identify only `DKV48M_` orders.
5. Reconcile local state.
6. Do not enter RUNNING until public WS, private WS, market freshness, clock skew, and account snapshot all pass.

### 4.8 Risk Engine

Preserve fail-closed semantics.

Hard DISARM triggers:

- Public WS offline.
- Private WS offline.
- Market data stale > 2 seconds.
- Clock skew exceeds configured hard limit.
- API error streak >= 3.
- Daily loss reaches configured hard stop.
- Risk rate reaches hard threshold.
- Order reconciliation ambiguity.
- Self-cross prevention failure.

Soft de-risk behavior:

- At inventory soft limit, widen inventory-adding side and tighten reducing side.
- At hard inventory limit, disable inventory-adding side.

DISARM must cancel V4.8 bot orders only.

## 5. Event-Driven Requote Policy

The engine MUST NOT reprice on a fixed high-frequency timer merely to create order traffic.

Requote evaluation is triggered by:

- best bid/ask price change
- meaningful top-level size change
- depth imbalance threshold crossing
- fill/partial fill
- inventory change
- volatility regime change
- existing quote age exceeding the maximum only when desired quote materially differs

A timer may be used only as a watchdog/reconciliation mechanism, not as the primary source of quote churn.

## 6. State Machine

Supported runtime states remain compatible with the existing control plane:

- STOPPED
- READY
- RUNNING
- PAUSED
- RISK_REDUCE
- DISARMED

START transition:

`DISARMED/STOPPED -> readiness checks -> READY -> RUNNING`

If any readiness check fails, remain DISARMED with an explicit reason.

PAUSE:

- Cancel V4.8 bot orders.
- Preserve connectivity and account monitoring.
- Do not create new quotes.

RESUME:

- Full reconciliation first.
- Then return to RUNNING only if all guards pass.

## 7. Metrics and Telemetry

Add to gateway telemetry and console:

- fair_price
- micro_price
- depth_imbalance
- short_volatility
- maker_bid_price
- maker_ask_price
- maker_bid_notional
- maker_ask_notional
- long_inventory_notional
- short_inventory_notional
- net_inventory_notional
- gross_inventory_notional
- quote_age_bid_ms
- quote_age_ask_ms
- fill_count
- maker_fill_count
- maker_fill_rate
- amend_count
- cancel_count
- cancel_to_fill_ratio
- estimated_adverse_selection_bps
- estimated_net_edge_bps
- last_reject_code
- last_reject_message
- last_reject_at

Existing telemetry fields must remain backward-compatible where practical.

## 8. Console Changes

Keep all current pages and restore no removed functionality.

Terminal page adds a dedicated Maker panel showing:

- Fair Price
- Microprice
- Depth Imbalance
- Short Volatility
- Maker Bid / Ask
- Quote Ages
- LONG / SHORT / Net Inventory
- Fill Rate
- Cancel/Fill Ratio
- Net Edge
- Last Reject Code + Message

Runtime status must clearly distinguish:

- READY
- RUNNING
- PAUSED
- RISK_REDUCE
- DISARMED

No UI element may claim RUNNING unless runtime truth from the Tokyo Gateway is RUNNING.

## 9. Persistence / Database

Prefer extending existing `gateway_telemetry`, `bot_runtime`, and `bot_orders` structures rather than creating a parallel control plane.

If new telemetry columns are required:

- Add them via an explicit Supabase migration.
- Preserve existing rows and consumers.
- Re-run security/performance advisors after DDL changes.

Order persistence must store only safe non-secret order metadata.

No API secret, session secret, listenKey, or gateway bearer token may be written to user-visible logs or tables.

## 10. Testing Strategy

Implementation follows TDD for each new behavior.

Required unit tests:

- Microprice calculation.
- Imbalance calculation.
- Fair-price clamp.
- Inventory skew direction.
- Hard inventory side-disable.
- Requote threshold.
- Minimum quote life.
- Self-cross prevention.
- Bot-order ownership prefix filtering.
- Stale-market fail closed.
- WS disconnect fail closed.
- API error streak fail closed.

Required integration tests without live orders:

- Parse representative Toobit bookTicker payload.
- Parse representative Toobit diffDepth payload.
- Rebuild shallow depth state.
- Serialize Toobit signed POST body in the exact configured wire format.
- Reconcile mock/open-order snapshots containing manual + DKV48M orders.

Production verification sequence:

1. Deploy with `RUNNING` impossible / DISARMED default.
2. Verify public bookTicker and diffDepth telemetry.
3. Verify private websocket.
4. Verify account snapshot and open-order reconciliation.
5. Verify quote calculation while execution disabled.
6. Verify one controlled POST_ONLY quote path only after all previous checks pass.
7. Verify Private WS order event.
8. Verify cancel/amend path.
9. Return to DISARMED after verification unless explicitly started by the operator.

## 11. Deployment Safety

Before replacing production Gateway code:

- Preserve a backup of the current working V4.7 gateway.
- Run syntax/unit tests.
- Deploy Bridge changes first if required.
- Confirm Bridge health.
- Deploy Gateway.
- Restart systemd service.
- Confirm heartbeat, Public WS, Private WS, account snapshot, and zero unintended bot orders.

Production deployment must end in `DISARMED` unless the operator explicitly presses START after deployment.

## 12. Explicit Non-Goals

V4.8 does not implement:

- self-trading
- wash trading
- quote stuffing
- volume-target forcing
- reward/rebate-volume maximization
- cross-account coordination
- cross-exchange hedging (future phase)
- ML price prediction

## 13. Success Criteria

V4.8 is considered complete only when all of the following are verified with fresh evidence:

1. Public bookTicker + diffDepth are both healthy.
2. Fair/microprice telemetry changes with the live market.
3. Private websocket remains healthy.
4. START enters RUNNING only after reconciliation.
5. At most one V4.8 bid and one V4.8 ask exist simultaneously.
6. Every V4.8 order is POST_ONLY and has `DKV48M_` clientOrderId.
7. Requotes prefer amend where supported.
8. Manual orders are never altered.
9. Self-cross guard prevents own bid/ask overlap.
10. Inventory hard limits stop same-direction accumulation.
11. Any hard safety failure cancels only V4.8 bot orders and DISARMs.
12. Console metrics reflect Gateway truth in real time.
13. Deployment ends DISARMED until explicitly started by the operator.
