# DKIVN VNext Phase 1 Isolation Runbook

## Purpose

This runbook validates process-level fault isolation before VNext receives any live strategy authority.

## Safety boundary

The files in this directory are deployment definitions. They are not installed or enabled merely by merging the staging branch.

Do not replace the existing `dkivn-v49-control`, Bitget executor, or live order-mutation services during Phase 1 foundation work.

The PostgreSQL outage test is disruptive and is guarded by `DKIVN_ALLOW_DB_OUTAGE_TEST=YES`. Run it only on a VNext test/canary environment with no production mutation authority.

The venue isolation test restarts only the existing read-only V14 Toobit shadow service by default. It does not restart the production Toobit executor.

## Intended install layout

- Engine artifact: `/opt/dkivn-vnext/engine`
- Console repository: `/opt/dkivn-vnext/console`
- Engine state: `/var/lib/dkivn-engine`
- UDS/runtime directory: `/run/dkivn`
- Environment files: `/etc/dkivn-vnext/*.env`

The three units have no `PartOf=` or `BindsTo=` relationships. A web/control restart therefore cannot ask systemd to restart the engine.

## Pre-cutover checks

1. Build contracts, engine/control tests, web build, and browser acceptance tests.
2. Confirm the current production engine services and PIDs.
3. Install VNext service files without enabling mutation authority.
4. Set `DKIVN_CONTROL_MUTATIONS_ENABLED=false`.
5. Start the Control API and Console only after PostgreSQL migrations pass.
6. Verify read models against current runtime/exchange truth.
7. Do not enable strategy promotion to LIVE in Phase 1.

## Isolation acceptance

### Console restart

Run only after the VNext engine and console units exist in a test/canary environment:

```bash
sudo DKIVN_ALLOW_RESTART_TEST=YES ./scripts/verify-isolation.sh
```

Pass conditions:

- engine PID is unchanged;
- runtime telemetry remains readable before and after;
- only the console process is restarted.

### PostgreSQL outage

```bash
sudo DKIVN_ALLOW_DB_OUTAGE_TEST=YES ./scripts/verify-postgres-outage.sh
```

Pass conditions:

- engine PID stays unchanged;
- RSS growth remains under the configured bounded threshold during the outage window;
- control-plane writes do not return 2xx;
- PostgreSQL is restored by the script trap;
- runtime read endpoint becomes available again.

### Venue fault isolation

This first-phase proof uses read-only V14 shadows:

```bash
sudo DKIVN_ALLOW_SHADOW_RESTART_TEST=YES ./scripts/verify-venue-isolation.sh
```

Pass conditions:

- Toobit shadow receives a new PID;
- Bitget shadow PID is unchanged.

A later VNext canary repeats the same test against VNext venue processes before live promotion.

## Current Tokyo host baseline (2026-09-23)

At design/implementation time, the Tokyo host still runs the existing V4.9/V14 production topology under `/opt/dkivn-v49`. VNext service definitions are staged separately and must not overwrite those units before the Phase 1 cutover gate.


## Executed acceptance evidence — 2026-09-23

Tokyo host `tokyo-gateway` read-only shadow isolation was exercised before any VNext cutover:

- Toobit V14 shadow PID before restart: `1047485`
- Toobit V14 shadow PID after restart: `1351412`
- Bitget V14 shadow PID before restart: `1047462`
- Bitget V14 shadow PID after Toobit restart: `1047462`
- Result: **PASS — Bitget shadow process was not restarted or coupled to the Toobit shadow lifecycle.**

This evidence covers the venue-isolation acceptance concept using existing read-only shadow processes. It does not substitute for the later VNext engine/console PID-isolation and PostgreSQL-outage tests, which require the VNext services to be installed in the canary environment.
