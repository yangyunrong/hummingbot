# DKIVN V4.9 Apple-Style UI Redesign — Design Spec

Date: 2026-09-08
Branch: `feature/dkivn-v49-product-terminal`
Status: Design approved at direction level (Option A: Apple Stocks × Wallet); implementation pending final spec approval.

## 1. Goal

Redesign the existing DKIVN V4.9 trading terminal into a premium, calm, Apple-inspired trading experience while preserving all trading-critical functionality, live charts, strategy controls, order visibility, risk diagnostics, and responsive mobile/desktop support.

Primary success criterion: the interface should feel intentionally designed rather than like an engineering dashboard, while still surfacing enough information for active market-making supervision.

## 2. Design Principles

1. Data first: price, equity, position, PnL, strategy state, and charts must carry the strongest visual weight.
2. Restraint: black / white / gray is the default palette; blue is the primary interaction accent; green, orange, and red appear only for semantic states.
3. Progressive disclosure: keep the first screen calm, move secondary technical details into dedicated views or expandable sections.
4. One obvious primary action per view.
5. Charts remain central and information-rich, but gridlines, axes, legends, and secondary annotations recede visually.
6. Mobile-first interaction quality, desktop-optimized information density.
7. Trading safety state must always remain visible and unambiguous.

## 3. Navigation Architecture

Keep exactly five primary destinations:

- Overview
- Strategy
- Orders
- Risk
- More

### Mobile

Use a fixed bottom navigation bar with five destinations. The active destination gets a subtle filled state rather than a heavy pill/card.

### Desktop

Use a compact left sidebar. The sidebar should be narrow and calm, with icon + label treatment and minimal chrome. It should not look like a generic admin panel.

## 4. Overview Page

### Mobile information order

1. Header
   - DKIVN wordmark
   - Toobit / BTCUSDT context
   - compact connection/live indicator

2. Account hero
   - large equity number
   - Today PnL directly below
   - Available, Position, Leverage, Risk as four compact metrics

3. Primary market chart
   - BTCUSDT candle / price chart from Toobit real market data
   - selectable timeframe: 1m / 5m / 15m / 1h
   - overlays: Fair Price, Microprice, Bot Bid, Bot Ask
   - fill markers when data is available
   - minimal axes and very subtle gridlines

4. Strategy control panel
   - Adaptive Maker title
   - Runtime state (`READY`, `RUNNING`, `RISK REDUCE`, `RECOVERING`, `PAUSED`, `DISARMED`)
   - auto-sizing value
   - decision loop interval
   - primary action: Start / Stop equivalent according to runtime state
   - secondary actions: Pause, Resume, DISARM, Flat All

5. Compact system health strip
   - Public WS
   - Private WS
   - API
   - market freshness

### Desktop information order

Two-column hero layout:

- Left ~70%: main BTCUSDT chart and market context
- Right ~30%: equity / PnL / position / strategy runtime / sizing / primary controls

Below that, a compact analytical row for inventory, PnL, and execution quality.

## 5. Charts

Charts are not optional and must be treated as first-class content.

### 5.1 Main Market Chart

Data source:
- Initial history: Toobit Futures `GET /quote/v1/klines`
- Live candle updates: Toobit Futures WebSocket `kline_<interval>` stream
- Supported UI timeframes in first release: 1m / 5m / 15m / 1h

Display:
- OHLC candle / price series
- Best Bid / Ask context
- Fair Price
- Microprice
- Bot Bid / Ask
- fills / executions when available

Interaction:
- timeframe selector
- hover / touch crosshair when technically feasible
- compact tooltip

The main market chart must use real Toobit data and must never fall back to fabricated sample market data.

### 5.2 PnL Chart

Display:
- Realized PnL
- Unrealized PnL
- Net PnL
- intraday time series

### 5.3 Inventory Chart

Display:
- Long inventory
- Short inventory
- Net inventory
- Gross exposure

### 5.4 Trading Volume Chart

Display:
- hourly / daily traded notional
- maker fills
- buy / sell split

### 5.5 MM Quality Panel / Chart

Display where data exists:
- fill rate
- cancel / fill ratio
- amend / fill ratio
- net edge
- quote age
- API latency

Charts should use restrained colors, thin strokes, subtle fills, minimal decoration, and clear numeric tooltips.

## 6. Strategy Page

Split into two visual tiers.

### Tier 1 — Live strategy summary

Show only:
- strategy mode
- Fair Price
- Microprice
- Depth Imbalance
- current inventory
- effective leverage
- current auto sizing
- gross budget / headroom

### Tier 2 — Editable parameters

Keep all existing editable controls, including:
- base quote / sizing inputs
- spread / edge parameters
- inventory risk
- capital utilization
- requested leverage
- requote threshold
- quote life
- order age
- daily loss hard stop
- dual-side max leverage
- monthly observation target

Use Apple-style grouped forms with fewer visible borders. Inputs should feel like inline editable values rather than web-form boxes.

Settings must remain saveable and reloadable from the existing backend.

## 7. Orders Page

Use a clean list/table hybrid.

Each live bot order should show:
- side
- position side
- price
- notional or exact quantity
- POST_ONLY status
- quote age
- client order ID (secondary detail)

History should distinguish:
- Filled
- Cancelled
- Partial
- Rejected

Secondary detail can include maker/taker classification, fee, fill latency, and PnL when available.

Mobile uses stacked rows/cards with no horizontal scrolling. Desktop uses a dense table with strong alignment and tabular numerals.

## 8. Risk Page

Primary risk metrics:
- leverage
- current long / short position
- gross exposure
- liquidation price / liquidation distance
- unrealized PnL
- daily PnL
- risk rate

Secondary system health:
- Public WS
- Private WS
- market freshness
- API error streak
- executor state
- last stop reason

Risk colors are semantic only:
- neutral = gray
- caution / risk reduce = orange
- hard stop / liquidation concern = red

## 9. More Page

Keep:
- Tokyo Trading API connection
- Funding / Arbitrage
- Exchange management
- API Diagnostics
- System settings

Use a native-settings style list rather than a dashboard-card grid.

## 10. Visual System

### Base palette

- App background: near-black (`#000000` / `#070707` range)
- Primary surface: translucent white 4–7%
- Elevated surface: translucent white 7–10%
- Primary text: near-white
- Secondary text: neutral gray
- Divider: low-contrast translucent white

### Semantic colors

- Blue: primary interaction / selected state
- Green: healthy / positive PnL only
- Orange: risk reduce / caution
- Red: loss / hard stop / liquidation / destructive actions

### Typography

Use the native system font stack first (`-apple-system`, `BlinkMacSystemFont`, etc.).

Use tabular numerals for all trading values.

Hierarchy:
- hero equity / price: very large, compact line-height
- section title: medium-large, semibold
- metric value: strong but smaller than hero
- metadata / labels: small, quiet gray

## 11. Surface and Motion

- Avoid putting every section in a bordered card.
- Use spacing and tonal surfaces to establish hierarchy.
- Rounded corners remain, but only on meaningful surfaces.
- Use restrained blur / glass effects; avoid decorative glass everywhere.
- Motion should be short and functional: state transitions, tab changes, chart updates, success/error feedback.
- No excessive glow, neon gradients, or crypto-exchange styling.

## 12. Responsive Behavior

### Mobile targets

Support at minimum:
- 360px
- 390px
- 393px
- 402px
- 430px

Requirements:
- no full-page horizontal overflow
- safe-area support
- minimum comfortable touch targets
- charts expand to available width
- order lists and settings never require horizontal scrolling

### Desktop targets

At >= 980px:
- left navigation sidebar
- wider main content
- multi-column dashboard layout
- chart-first composition

At very wide displays, cap content width to preserve visual focus.

## 13. Existing Functional Contracts That Must Not Regress

The UI redesign must not alter execution semantics.

Must preserve:
- V49 Tokyo local executor wiring
- START / Pause / Resume / DISARM / Flat All
- runtime capability gate
- Auto-Run desired state semantics
- exact-contract reduce-only tail handling
- AUTO position-aware sizing
- strategy settings persistence
- API credential binding flow
- 5-tab navigation contract
- mobile safe-area behavior

## 14. Data Additions Needed for Charts

### Market candles

No local synthetic candle builder is required for the main chart. Use Toobit public market-data APIs directly through the existing server/proxy boundary:
- historical Klines from `/quote/v1/klines`
- live Kline updates from the public WebSocket stream

### Local historical observation buffers

Where current APIs do not provide app-specific chart history, add read-only local history buffers / lightweight time-series endpoints for:
- Fair / Micro / Bot Bid / Bot Ask snapshots
- PnL timeline
- inventory timeline
- execution quality metrics

These additions must not sit in the trading hot path and must not block or delay order execution. Observation writes must be best-effort and droppable under load.

## 15. Error and Empty States

Use plain-language states, not raw engineering strings as the primary copy.

Examples:
- `MARKET_STALE` -> `行情暫時中斷`
- `PRIVATE_WS_OFFLINE` -> `帳戶連線恢復中`
- `RISK_REDUCE` -> `正在降低曝險`
- `API_ERROR_STREAK` -> `交易 API 異常，已停止`

Raw codes remain accessible in Diagnostics.

Empty charts should show a quiet placeholder with the reason (for example, “尚未累積足夠資料”), not blank boxes.

## 16. Accessibility and Readability

- Do not rely only on red/green differentiation.
- Maintain readable contrast.
- Provide text labels for chart series and semantic states.
- Touch targets should remain comfortable on mobile.
- Trading-critical values should never be hidden behind hover-only interactions.

## 17. Implementation Boundaries

Expected UI files to change:
- `dkivn/v49/console/index.html`
- `dkivn/v49/console/app.css`
- `dkivn/v49/console/app.js`
- `dkivn/v49/console/controls.js`

Likely new UI/chart modules:
- chart rendering module(s)
- chart data store / formatter
- UI state formatter

Possible read-only backend additions:
- historical telemetry / chart-series endpoint(s)
- public Kline proxy if direct browser access is undesirable or blocked by CORS

Trading execution core (`maker-core`, `live-runtime`, order transport) must not be changed unless a chart data requirement strictly needs a non-blocking observation hook.

## 18. Testing

Add / update tests for:
- exactly five primary navigation destinations
- mobile safe-area and no horizontal overflow
- desktop sidebar layout
- presence of main market chart
- presence of PnL, inventory, volume / MM analytics surfaces
- strategy parameters remain editable
- lifecycle controls remain wired to Tokyo local executor
- plain-language runtime status mapping
- chart empty states
- Kline history uses real Toobit market data
- no browser storage of API secrets

Visual manual verification:
- iPhone-sized viewport
- desktop 1440px viewport
- Safari / WebKit behavior
- Chrome desktop

## 19. Acceptance Criteria

The redesign is complete only when:

1. Mobile and desktop both look intentional and polished.
2. The first viewport clearly communicates equity, market state, strategy state, and one primary action.
3. Charts are present, readable, and visually dominant where appropriate.
4. Main market chart is backed by real Toobit Kline data.
5. Strategy parameters remain fully editable and persistent.
6. Orders and risk data remain fully accessible.
7. No regression in V4.9 lifecycle controls or executor wiring.
8. No horizontal overflow on supported mobile widths.
9. All automated UI/runtime contract tests pass.
10. Production deployment is versioned and rollback-safe.
11. Existing `/v49/` behavior remains available for rollback until the redesigned build is verified.

## 20. Rollout

1. Build redesign on the existing V4.9 feature branch.
2. Deploy to a versioned preview path / cache-busted V4.9 build.
3. Verify mobile + desktop layouts and live data.
4. Verify all runtime controls without altering trading behavior.
5. Promote the redesigned UI to `/v49/` only after validation.
6. Keep a rollback copy of the current UI assets.
