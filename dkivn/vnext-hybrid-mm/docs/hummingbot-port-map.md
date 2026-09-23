# Hummingbot -> DKIVN port map

## What is reused conceptually

| Hummingbot concept | DKIVN destination | Rule |
|---|---|---|
| Avellaneda reservation price | Fair Value / Hybrid MM | Pure math only |
| volatility indicator | Nearline parameter cache | Never recompute heavy stats per tick |
| trading intensity / kappa | Nearline parameter cache | Feed scalar kappa into hot path |
| inventory skew | Hybrid MM inventory policy | DKIVN limits remain authoritative |
| order refresh tolerance | Churn Gate | Event-driven; not timer churn |
| filled order delay | Fill cooldown | Safety-aware and symbol-local |
| Executor separation | Planner/Mutation/Truth layers | Do not import Python executor runtime |

## DKIVN decision order

1. Exchange truth / coverage health
2. Market freshness
3. Fair value and A-S reservation price
4. Inventory skew
5. Toxic-flow / markout cost
6. Queue penalty / fill probability
7. Expected maker EV
8. Churn / quote-life gate
9. Planner
10. Mutation Gateway with fencing
11. Private WS truth / reconcile

## Important deviation from Hummingbot

A-S is **not** allowed to directly place or cancel orders.

This avoids reintroducing the failure modes already seen in DKIVN:
- duplicate slots
- stale ownership
- unknown ACK replay
- coverage divergence
- quote churn
- one-sided inventory accumulation

## Nearline parameters

Update on a slower cadence and publish atomically:
- sigma2
- kappa
- baseline expected markout by side
- latency cost
- queue penalty calibration

Per-tick inputs remain:
- best bid / ask
- microprice / reference price
- OBI / OFI
- toxicity
- current inventory
- queue state
- truth health

## Rollout

Phase A: shadow-only output, no planner authority.
Phase B: compare legacy desired quotes vs Hybrid-MM desired quotes in replay/live shadow.
Phase C: enable EV gate while retaining legacy price formation.
Phase D: enable A-S reservation/spread for one symbol.
Phase E: expand to BTC + dynamic Top1 only after markout and churn gates pass.

No production cutover should happen without replay parity, zero duplicate ownership and verified fail-closed behavior.
