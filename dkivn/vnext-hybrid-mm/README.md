# DKIVN Hybrid-MM VNext

This branch is an isolated reference implementation for porting Hummingbot market-making ideas into the DKIVN Node.js event-driven runtime.

## Design rule

Hummingbot is a **model source**, not the execution runtime.

The production path remains:

Market WS -> L2 Normalizer -> Feature Engine -> Fair Value -> Hybrid MM -> Planner -> Mutation Gateway -> Exchange -> Private Truth -> Reconcile

The Hybrid MM node never performs network I/O and never mutates exchange state.

## Borrowed ideas

- Avellaneda-Stoikov reservation price / risk-adjusted spread
- volatility and trading-intensity parameters as nearline inputs
- inventory skew
- quote refresh tolerance / filled-order delay concepts
- executor lifecycle separation

## DKIVN additions

- microprice / OBI / OFI
- toxicity / expected markout gate
- queue quality and fill probability
- maker rebate / spread capture in expected EV
- inventory adding-side suppression
- churn gate
- fail-closed truth/coverage ownership

## Quote decision

A quote can be emitted only when:

1. runtime truth is healthy,
2. market data is fresh,
3. side is allowed by inventory policy,
4. expected EV >= minimum edge,
5. toxicity is below hard stop,
6. queue quality is acceptable,
7. price change exceeds requote threshold unless safety requires a cancel,
8. the quote is post-only and cannot self-cross.

The implementation in `src/hybrid-mm-engine.js` is allocation-light and pure: caller supplies a reusable output object.

## Integration

Do not replace DKIVN Planner/Executor with Hummingbot executors.

Map the output fields:
- `bid.price / ask.price` -> desired quote price
- `bid.enabled / ask.enabled` -> planner side gate
- `bid.evBps / ask.evBps` -> telemetry + planner threshold
- `reservationPrice` -> fair-value telemetry
- `optimalHalfSpreadBps` -> spread telemetry
- `dynamicGamma` -> risk telemetry

Production integration must preserve current ownership, coverage, fencing, PENDING_ACK/UNKNOWN and reconciliation semantics.
