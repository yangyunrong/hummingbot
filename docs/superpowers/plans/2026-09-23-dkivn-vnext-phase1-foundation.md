# DKIVN VNext Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production-safe VNext foundation that physically separates live trading from the web control plane while providing versioned contracts, a fenced local control protocol, durable PostgreSQL telemetry/alerts, and a read-only real-data operations dashboard.

**Architecture:** Create three independently deployable repositories: `dkivn-contracts`, `dkivn-engine`, and `dkivn-console`. The engine remains the only exchange-mutation authority; the console talks to a separate Control API, which sends low-frequency generation-fenced commands to the engine over a Unix Domain Socket. The engine emits bounded telemetry to an external collector, which persists PostgreSQL read models consumed by the web UI.

**Tech Stack:** Node.js 22+, TypeScript 5+, Zod 4, native `node:net` Unix Domain Sockets, PostgreSQL 16+, Drizzle ORM + drizzle-kit, Fastify 5, Next.js 16 App Router, React 19, Tailwind CSS 4, shadcn/ui, Vitest, Playwright, Docker Compose for local integration tests.

**Spec:** `docs/superpowers/specs/2026-09-23-dkivn-vnext-system-design.md`

## Global Constraints

- The browser MUST NOT hold exchange credentials or call exchange mutation APIs.
- The live engine remains the only component with order mutation authority.
- Toobit and Bitget runtime state, rate limiter, truth, ownership, coverage, and mutation generation remain isolated.
- PostgreSQL is the production durable source of truth; SQLite is not.
- Redis is not required for live trading correctness or live mutation.
- Strategy config updates are immutable, generation-fenced, and applied by atomic reference swap without restarting market/private WebSockets.
- The live strategy thread MUST NOT synchronously write PostgreSQL.
- Telemetry queues MUST be bounded; telemetry degradation must not create unbounded memory growth.
- Console deployment/restart MUST NOT restart the live engine.
- All dashboard runtime values MUST have an explicit real source; there is no fake-data fallback.
- No generic browser-accessible place/cancel order endpoint is permitted.
- Raw high-frequency telemetry is retained with a bounded policy and later exported to Parquet; PostgreSQL stores operational read models and metadata.
- Any actual reused MIT code must retain required notices. AGPL or unlicensed reference implementation code must not be copied into DKIVN proprietary modules.
- Phase 1 does not grant new strategies live authority.

## Review Focus

- **Duplicate or stale control command:** a command with a generation not greater than the engine's applied generation must be rejected and must not change runtime config.
- **Malformed or oversized IPC frame:** the engine must close/reject the frame without allocating an unbounded buffer or changing state.
- **PostgreSQL outage:** live engine continues with bounded telemetry loss; config promotion becomes unavailable rather than partially succeeding.
- **Console/UI stale state:** UI must show UNKNOWN/OFFLINE and source age, never infer RUNNING from the last successful browser response.
- **One venue failure:** Toobit degradation must not silently change Bitget runtime state unless an explicit cross-venue dependency exists.

---

## File Structure

### Repository: `dkivn-contracts`

- `package.json` — package metadata, build/test scripts, exports.
- `tsconfig.json` — strict TypeScript config.
- `src/enums.ts` — Venue, RuntimeState, StrategyMode, lifecycle enums.
- `src/strategy-config.ts` — immutable StrategyConfig envelope/schema.
- `src/telemetry.ts` — venue/symbol telemetry schemas.
- `src/alerts.ts` — AlertEvent schema.
- `src/control.ts` — IPC command/response envelopes.
- `src/index.ts` — public exports.
- `test/*.test.ts` — schema compatibility and invalid-input tests.

### Repository: `dkivn-engine`

- `src/control/frame-codec.ts` — 4-byte length-prefixed JSON frame codec.
- `src/control/control-server.ts` — UDS server, auth-by-filesystem, decode/dispatch.
- `src/config/runtime-config-store.ts` — generation-fenced immutable config reference.
- `src/telemetry/spsc-ring.ts` — bounded single-producer/single-consumer ring.
- `src/telemetry/telemetry-worker.ts` — non-hot-path batching/export.
- `src/runtime/venue-runtime.ts` — per-venue status adapter for read telemetry.
- `test/control/*.test.ts`, `test/telemetry/*.test.ts` — IPC and bounded queue tests.

### Repository: `dkivn-console`

- `apps/control-api/src/server.ts` — Fastify server.
- `apps/control-api/src/ipc/engine-client.ts` — UDS client.
- `apps/control-api/src/db/schema.ts` — Drizzle PostgreSQL schema.
- `apps/control-api/src/db/client.ts` — DB connection.
- `apps/control-api/src/routes/runtime.ts` — venue/symbol read models.
- `apps/control-api/src/routes/alerts.ts` — alert queries.
- `apps/control-api/src/routes/configs.ts` — draft/create/promotion routes.
- `apps/control-api/src/telemetry/collector.ts` — external telemetry ingestion.
- `apps/control-api/src/alerts/dispatcher.ts` — Telegram/UI fan-out from persisted alerts.
- `apps/control-api/drizzle/*.sql` — migrations.
- `apps/web/app/page.tsx` — overview.
- `apps/web/app/venues/page.tsx` — venue execution lanes.
- `apps/web/app/symbols/page.tsx` — symbol operating table.
- `apps/web/app/alerts/page.tsx` — Alert Center.
- `apps/web/components/*` — operational UI components.
- `apps/web/lib/api.ts` — typed Control API client.
- `apps/web/e2e/*.spec.ts` — browser acceptance tests.

### Deployment / integration

- `infra/docker-compose.dev.yml` — Postgres + control API + console, never the production trading process.
- `infra/systemd/dkivn-engine.service` — live engine only.
- `infra/systemd/dkivn-control-api.service` — control API only.
- `infra/systemd/dkivn-console.service` — web only.
- `scripts/verify-isolation.sh` — proves console restart does not touch engine PID/WS state.

---

### Task 0: Create the Three Repository Boundaries and Pin Contract Distribution

**Repositories:**
- Create: `dkivn-contracts`
- Create: `dkivn-engine`
- Create: `dkivn-console`

**Files:**
- Create: `dkivn-contracts/.github/workflows/publish.yml`
- Create: `dkivn-contracts/.npmrc`
- Create: `dkivn-engine/.npmrc`
- Create: `dkivn-console/.npmrc`
- Create: `dkivn-engine/package.json`
- Create: `dkivn-console/package.json`
- Create: `dkivn-console/package-lock.json` through `npm install`
- Create: `dkivn-engine/package-lock.json` through `npm install`

**Interfaces:**
- Consumes: approved VNext System Design Spec.
- Produces: independent Git repositories and an immutable package-distribution path for `@dkivn/contracts`.

- [ ] **Step 1: Create repositories without moving production runtime yet**

Create three private repositories and initialize `main` with README files stating their single responsibility. Do not delete, rename, or relocate the existing live DKIVN runtime during this step.

- [ ] **Step 2: Configure private package registry for contracts**

Use GitHub Packages for `@dkivn/contracts`:

```ini
@dkivn:registry=https://npm.pkg.github.com
always-auth=true
```

CI obtains `NODE_AUTH_TOKEN` from repository-scoped secrets/permissions. Tokens MUST NOT be committed.

- [ ] **Step 3: Add contracts publish workflow**

```yaml
name: publish-contracts
on:
  push:
    tags:
      - "contracts-v*"

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://npm.pkg.github.com
      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 4: Pin consumers to exact contract versions**

Engine and Console must use an exact version, never `latest`, `*`, or caret ranges:

```json
{
  "dependencies": {
    "@dkivn/contracts": "0.1.0"
  }
}
```

A contract upgrade is an explicit PR in each consumer repo and is test-gated independently.

- [ ] **Step 5: Add lockfile policy test to CI**

CI fails if `package.json` uses a non-exact `@dkivn/contracts` version:

```js
const pkg = require("./package.json");
const v = pkg.dependencies?.["@dkivn/contracts"];
if (!/^\d+\.\d+\.\d+$/.test(v || "")) {
  throw new Error("@dkivn/contracts must be pinned to an exact semver");
}
```

Run this check in both `dkivn-engine` and `dkivn-console`.

- [ ] **Step 6: Prove repository deployment independence**

Create separate CI workflows with no cross-repository deployment trigger. Publishing a contracts package may open/enable dependency-update PRs, but MUST NOT automatically deploy Engine or Console.

- [ ] **Step 7: Commit each repository bootstrap**

```bash
git add .
git commit -m "chore: bootstrap DKIVN VNext repository boundary"
```

---

### Task 1: Bootstrap and Publish `dkivn-contracts`

**Files:**
- Create: `dkivn-contracts/package.json`
- Create: `dkivn-contracts/tsconfig.json`
- Create: `dkivn-contracts/src/enums.ts`
- Create: `dkivn-contracts/src/index.ts`
- Test: `dkivn-contracts/test/enums.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `VenueSchema`, `RuntimeStateSchema`, `StrategyModeSchema`, `OrderLifecycleStateSchema` and inferred TypeScript types.

- [ ] **Step 1: Write the enum schema tests**

```ts
// test/enums.test.ts
import { describe, expect, it } from "vitest";
import {
  VenueSchema,
  RuntimeStateSchema,
  StrategyModeSchema,
  OrderLifecycleStateSchema,
} from "../src/index.js";

describe("core enums", () => {
  it("accepts only supported venues", () => {
    expect(VenueSchema.parse("TOOBIT")).toBe("TOOBIT");
    expect(VenueSchema.parse("BITGET")).toBe("BITGET");
    expect(() => VenueSchema.parse("BINANCE")).toThrow();
  });

  it("does not infer runtime state", () => {
    expect(RuntimeStateSchema.parse("RUNNING")).toBe("RUNNING");
    expect(() => RuntimeStateSchema.parse("ONLINE")).toThrow();
  });

  it("pins supported strategies and order lifecycle states", () => {
    expect(StrategyModeSchema.parse("HYBRID_MM")).toBe("HYBRID_MM");
    expect(OrderLifecycleStateSchema.parse("UNKNOWN")).toBe("UNKNOWN");
    expect(() => OrderLifecycleStateSchema.parse("RETRYING_BLINDLY")).toThrow();
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd dkivn-contracts
npm test -- --run test/enums.test.ts
```

Expected: FAIL because exports do not exist.

- [ ] **Step 3: Add package metadata**

```json
{
  "name": "@dkivn/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vitest": "^3.2.0",
    "@types/node": "^22.0.0"
  }
}
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Implement the enums**

```ts
// src/enums.ts
import { z } from "zod";

export const VenueSchema = z.enum(["TOOBIT", "BITGET"]);
export type Venue = z.infer<typeof VenueSchema>;

export const RuntimeStateSchema = z.enum([
  "STOPPED", "READY", "RUNNING", "PAUSED",
  "RISK_REDUCE", "RECOVERING", "DISARMED"
]);
export type RuntimeState = z.infer<typeof RuntimeStateSchema>;

export const StrategyModeSchema = z.enum([
  "HYBRID_MM", "ADAPTIVE_GRID", "CROSS_VENUE_ARB", "INVENTORY_REDUCE"
]);
export type StrategyMode = z.infer<typeof StrategyModeSchema>;

export const OrderLifecycleStateSchema = z.enum([
  "IDLE", "PENDING_CREATE", "ACTIVE", "PARTIAL",
  "PENDING_CANCEL", "PENDING_AMEND", "UNKNOWN",
  "FILLED", "CANCELLED", "REJECTED", "FAILED"
]);
export type OrderLifecycleState = z.infer<typeof OrderLifecycleStateSchema>;
```

```ts
// src/index.ts
export * from "./enums.js";
```

- [ ] **Step 5: Run test and build**

Run:

```bash
npm test -- --run test/enums.test.ts
npm run build
```

Expected: PASS and TypeScript build exits 0.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json src test
git commit -m "feat(contracts): add core DKIVN enums"
```

---

### Task 2: Define Strategy, Telemetry, Alert, and Control Contracts

**Files:**
- Create: `dkivn-contracts/src/strategy-config.ts`
- Create: `dkivn-contracts/src/telemetry.ts`
- Create: `dkivn-contracts/src/alerts.ts`
- Create: `dkivn-contracts/src/control.ts`
- Modify: `dkivn-contracts/src/index.ts`
- Test: `dkivn-contracts/test/contracts.test.ts`

**Interfaces:**
- Consumes: Task 1 enums.
- Produces: `StrategyConfigEnvelopeSchema`, `VenueTelemetrySchema`, `SymbolTelemetrySchema`, `AlertEventSchema`, `ControlCommandSchema`, `ControlResponseSchema`.

- [ ] **Step 1: Write failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import {
  AlertEventSchema,
  ControlCommandSchema,
  StrategyConfigEnvelopeSchema,
  VenueTelemetrySchema,
} from "../src/index.js";

const validConfig = {
  id: "cfg_1",
  version: "v18.4.3",
  generation: "1843",
  createdAt: "2026-09-23T05:00:00.000Z",
  createdBy: "operator",
  status: "DRAFT",
  venueScope: ["TOOBIT"],
  symbolScope: ["BTC-SWAP-USDT"],
  checksum: "sha256:abc",
  config: {
    strategyMode: "HYBRID_MM",
    quote: {
      baseNotionalUsdt: 10,
      levels: 5,
      maxOrdersPerSymbol: 10,
      minQuoteLifeMs: 2500,
      requoteThresholdBps: 2,
      postOnly: true
    },
    inventory: {
      targetNetUsdt: 0,
      softLimitUsdt: 10,
      hardLimitUsdt: 20,
      maxGrossUsdt: 40
    },
    hybridMm: {
      baseGamma: 0.05,
      gammaToxicityMultiplier: 2,
      gammaInventoryMultiplier: 2,
      minHalfSpreadBps: 1,
      minExpectedEvBps: 0,
      toxicityHardStop: 0.9,
      markoutWindowMs: 500
    },
    grid: {
      enabled: false,
      spacingMode: "VOLATILITY",
      fixedSpacingBps: 4,
      maxLevels: 5,
      positionThresholdUsdt: 20
    },
    crossVenue: {
      enabled: false,
      makerVenue: "TOOBIT",
      hedgeVenue: "BITGET",
      minNetSpreadBps: 2,
      fillTimeoutMs: 5000,
      maxHedgeLagMs: 250
    },
    risk: {
      maxDailyLossUsdt: 2,
      maxApiErrorStreak: 3,
      maxMarketAgeMs: 2000,
      maxPrivateWsAgeMs: 2000,
      maxTruthAgeMs: 2000,
      maxCoverageDeficitUsdt: 0
    }
  }
};

it("accepts a valid immutable strategy envelope", () => {
  expect(StrategyConfigEnvelopeSchema.parse(validConfig).version).toBe("v18.4.3");
});

it("rejects unsafe quote settings", () => {
  const bad = structuredClone(validConfig);
  bad.config.quote.postOnly = false;
  expect(() => StrategyConfigEnvelopeSchema.parse(bad)).toThrow();
});

it("requires telemetry source age", () => {
  expect(() => VenueTelemetrySchema.parse({
    venue: "TOOBIT",
    runtimeState: "RUNNING"
  })).toThrow();
});

it("rejects an alert without a durable wall-clock start time", () => {
  expect(() => AlertEventSchema.parse({
    id: "a", fingerprint: "x", level: "P0"
  })).toThrow();
});

it("rejects stale or malformed config command payloads at schema layer", () => {
  expect(() => ControlCommandSchema.parse({
    protocolVersion: 1,
    commandId: "cmd_1",
    type: "APPLY_CONFIG",
    generation: "-1"
  })).toThrow();
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
npm test -- --run test/contracts.test.ts
```

Expected: FAIL because schemas are missing.

- [ ] **Step 3: Implement StrategyConfig schema with server-safe invariants**

Use Zod refinements to enforce:

- `postOnly === true`.
- `softLimitUsdt <= hardLimitUsdt <= maxGrossUsdt`.
- `levels >= 1`, `maxOrdersPerSymbol >= levels`.
- `makerVenue !== hedgeVenue` when cross-venue is enabled.
- all timeouts are positive finite integers.
- generation is a non-negative decimal string because JSON cannot safely round-trip BigInt.

- [ ] **Step 4: Implement telemetry schemas**

Required `VenueTelemetry` fields:

```ts
{
  venue,
  runtimeState,
  sourceAt,
  sourceAgeMs,
  publicWsAgeMs,
  privateWsAgeMs,
  truthAgeMs,
  todayVolumeUsdt,
  makerVolumeUsdt,
  takerVolumeUsdt,
  realizedPnlUsdt,
  feesUsdt,
  rebateUsdt,
  fundingUsdt,
  coreWearBps,
  netWearBps,
  activeOrders,
  maxOrders,
  netInventoryUsdt,
  coverageDeficitUsdt,
  latency: {
    sendToAckP50Ms,
    sendToAckP95Ms,
    sendToAckP99Ms,
    eventLoopP99Ms,
    gcPauseP99Ms
  }
}
```

Required `SymbolTelemetry` fields:

```ts
{
  venue,
  symbol,
  sourceAt,
  sourceAgeMs,
  strategyMode,
  regime,
  activeOrders,
  maxOrders,
  longInventoryUsdt,
  shortInventoryUsdt,
  netInventoryUsdt,
  todayVolumeUsdt,
  makerRatio,
  bidEvBps,
  askEvBps,
  toxicity,
  markout500Bps,
  alertLevel
}
```

- [ ] **Step 5: Implement AlertEvent and Control schemas**

Control command discriminated union:

```ts
type ControlCommand =
  | { type: "APPLY_CONFIG"; generation: string; config: StrategyConfigEnvelope }
  | { type: "START_VENUE"; generation: string; venue: Venue }
  | { type: "PAUSE_VENUE"; generation: string; venue: Venue }
  | { type: "RESUME_VENUE"; generation: string; venue: Venue }
  | { type: "DISARM_VENUE"; generation: string; venue: Venue; reason: string }
  | { type: "CANCEL_OWNED"; generation: string; venue: Venue; symbol?: string };
```

No `PLACE_ORDER` or arbitrary `CANCEL_ORDER` browser/control-plane command is defined.

- [ ] **Step 6: Add exports, run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src test
git commit -m "feat(contracts): define strategy telemetry alert and control schemas"
```

---

### Task 3: Build the Generation-Fenced Unix Domain Socket Protocol

**Files:**
- Create: `dkivn-engine/src/control/frame-codec.ts`
- Create: `dkivn-engine/src/control/control-server.ts`
- Test: `dkivn-engine/test/control/frame-codec.test.ts`
- Test: `dkivn-engine/test/control/control-server.test.ts`

**Interfaces:**
- Consumes: `ControlCommandSchema`, `ControlResponseSchema` from `@dkivn/contracts`.
- Produces: `encodeFrame(value): Buffer`, `FrameDecoder.push(chunk): unknown[]`, `ControlServer.start(socketPath)`.

Protocol:

```text
4-byte unsigned big-endian payload length
UTF-8 JSON payload
```

Maximum payload: exactly 1 MiB.

- [ ] **Step 1: Write frame codec tests**

```ts
import { describe, expect, it } from "vitest";
import { encodeFrame, FrameDecoder } from "../../src/control/frame-codec.js";

it("decodes a fragmented frame", () => {
  const frame = encodeFrame({ commandId: "x", ok: true });
  const d = new FrameDecoder();
  expect(d.push(frame.subarray(0, 3))).toEqual([]);
  expect(d.push(frame.subarray(3))).toEqual([{ commandId: "x", ok: true }]);
});

it("decodes coalesced frames", () => {
  const d = new FrameDecoder();
  const chunk = Buffer.concat([encodeFrame({ n: 1 }), encodeFrame({ n: 2 })]);
  expect(d.push(chunk)).toEqual([{ n: 1 }, { n: 2 }]);
});

it("rejects oversized frames before payload allocation", () => {
  const d = new FrameDecoder();
  const header = Buffer.alloc(4);
  header.writeUInt32BE(1024 * 1024 + 1);
  expect(() => d.push(header)).toThrow(/FRAME_TOO_LARGE/);
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
npm test -- --run test/control/frame-codec.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement bounded frame codec**

The decoder must:

- retain at most `MAX_FRAME_BYTES + 4` bytes for one incomplete frame;
- reject a declared payload length greater than 1 MiB immediately after reading the header;
- use one `JSON.parse` per complete frame;
- reset its internal state after malformed JSON.

- [ ] **Step 4: Write stale-generation server test**

```ts
it("rejects generation <= applied generation without dispatch", async () => {
  const dispatch = vi.fn();
  const server = makeTestControlServer({ appliedGeneration: 10n, dispatch });
  const response = await server.handle({
    protocolVersion: 1,
    commandId: "c1",
    type: "START_VENUE",
    generation: "10",
    venue: "TOOBIT"
  });
  expect(response.ok).toBe(false);
  expect(response.code).toBe("STALE_GENERATION");
  expect(dispatch).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Implement ControlServer**

Server validation order:

1. Decode bounded frame.
2. Parse `ControlCommandSchema`.
3. Parse generation to BigInt.
4. Reject `generation <= lastAppliedGeneration`.
5. Dispatch command.
6. Only after successful state transition, advance the applied generation.
7. Return a response containing `commandId`, `ok`, `code`, and `appliedGeneration`.

- [ ] **Step 6: Run control tests**

Run:

```bash
npm test -- --run test/control
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/control test/control
git commit -m "feat(engine): add bounded generation-fenced control socket"
```

---

### Task 4: Add Immutable Runtime Config Store and Atomic Swap Boundary

**Files:**
- Create: `dkivn-engine/src/config/runtime-config-store.ts`
- Create: `dkivn-engine/src/config/apply-config-command.ts`
- Test: `dkivn-engine/test/config/runtime-config-store.test.ts`

**Interfaces:**
- Consumes: validated `StrategyConfigEnvelope`.
- Produces: `RuntimeConfigStore.current()`, `RuntimeConfigStore.apply(envelope)`.

- [ ] **Step 1: Write stale and immutable-config tests**

```ts
it("atomically replaces config only with a newer generation", () => {
  const store = new RuntimeConfigStore(config("100"));
  const before = store.current();
  expect(store.apply(config("101")).ok).toBe(true);
  expect(store.current().generation).toBe("101");
  expect(store.current()).not.toBe(before);
  expect(store.apply(config("100")).code).toBe("STALE_GENERATION");
  expect(store.current().generation).toBe("101");
});

it("freezes the applied snapshot", () => {
  const store = new RuntimeConfigStore(config("100"));
  expect(Object.isFrozen(store.current())).toBe(true);
  expect(Object.isFrozen(store.current().config.quote)).toBe(true);
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
npm test -- --run test/config/runtime-config-store.test.ts
```

- [ ] **Step 3: Implement deep freeze at the control-plane boundary**

Use a bounded recursive deep-freeze because config objects are small and updates are low frequency. Do not perform this work per tick.

- [ ] **Step 4: Integrate `APPLY_CONFIG` into ControlServer dispatcher**

The dispatcher must not reconnect public/private WS and must not recreate venue transport objects.

Add a test that injects fake `publicWsConnectionId` and `privateWsConnectionId`, applies config, and asserts both IDs are unchanged.

- [ ] **Step 5: Run config and control tests**

Run:

```bash
npm test -- --run test/config test/control
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/config src/control test/config test/control
git commit -m "feat(engine): add immutable strategy config swap"
```

---

### Task 5: Build Bounded Engine Telemetry Ring and External Collector Transport

**Files:**
- Create: `dkivn-engine/src/telemetry/spsc-ring.ts`
- Create: `dkivn-engine/src/telemetry/telemetry-worker.ts`
- Test: `dkivn-engine/test/telemetry/spsc-ring.test.ts`
- Test: `dkivn-engine/test/telemetry/telemetry-worker.test.ts`

**Interfaces:**
- Consumes: `VenueTelemetry`, `SymbolTelemetry`, `AlertEvent`.
- Produces: bounded `tryPush(event): boolean`, `tryPop(): event | undefined`, and batch sender.

- [ ] **Step 1: Write bounded ring tests**

```ts
it("never grows beyond capacity", () => {
  const ring = new SpscRing<number>(4);
  expect(ring.tryPush(1)).toBe(true);
  expect(ring.tryPush(2)).toBe(true);
  expect(ring.tryPush(3)).toBe(true);
  expect(ring.tryPush(4)).toBe(true);
  expect(ring.tryPush(5)).toBe(false);
  expect(ring.capacity).toBe(4);
  expect(ring.dropped).toBe(1);
});

it("preserves FIFO order", () => {
  const ring = new SpscRing<number>(3);
  ring.tryPush(10);
  ring.tryPush(20);
  expect(ring.tryPop()).toBe(10);
  expect(ring.tryPop()).toBe(20);
});
```

- [ ] **Step 2: Run and verify RED**

- [ ] **Step 3: Implement fixed-capacity SPSC ring**

Use a preallocated array and integer read/write indices. No `Array.shift()`.

- [ ] **Step 4: Write collector-outage test**

```ts
it("drops telemetry after bounded capacity instead of blocking strategy", async () => {
  const sender = vi.fn().mockRejectedValue(new Error("collector down"));
  const worker = makeTelemetryWorker({ capacity: 2, sender });
  expect(worker.publish(event(1))).toBe(true);
  expect(worker.publish(event(2))).toBe(true);
  expect(worker.publish(event(3))).toBe(false);
  expect(worker.metrics.dropped).toBe(1);
});
```

- [ ] **Step 5: Implement non-blocking batch worker**

Rules:

- strategy-facing `publish()` is synchronous and never awaits network;
- worker batches up to 256 events or 50ms, whichever comes first;
- retry queue shares the same bounded capacity, never a second unbounded queue;
- collector failure increments counters;
- repeated failure generates one deduplicated local health signal rather than one alert per event.

- [ ] **Step 6: Run telemetry tests and commit**

```bash
npm test -- --run test/telemetry
git add src/telemetry test/telemetry
git commit -m "feat(engine): add bounded non-blocking telemetry pipeline"
```

---

### Task 6: Create PostgreSQL Operational Schema and Migrations

**Files:**
- Create: `dkivn-console/apps/control-api/src/db/schema.ts`
- Create: `dkivn-console/apps/control-api/src/db/client.ts`
- Create: `dkivn-console/apps/control-api/drizzle.config.ts`
- Create: `dkivn-console/apps/control-api/drizzle/0001_vnext_foundation.sql`
- Test: `dkivn-console/apps/control-api/test/db/schema.integration.test.ts`

**Interfaces:**
- Consumes: contracts from Tasks 1-2.
- Produces: durable tables `strategy_configs`, `strategy_promotions`, `venue_runtime_latest`, `symbol_runtime_latest`, `venue_daily_metrics`, `symbol_daily_metrics`, `alerts`, `audit_log`.

- [ ] **Step 1: Write database migration integration test**

Test against PostgreSQL 16 container and assert required unique/foreign-key constraints exist.

Required uniqueness:

- `strategy_configs(version)`.
- `strategy_configs(generation)`.
- `venue_runtime_latest(venue)`.
- `symbol_runtime_latest(venue, symbol)`.
- `alerts(fingerprint, started_at)`.

- [ ] **Step 2: Write migration**

Important columns:

```sql
CREATE TABLE strategy_configs (
  id uuid PRIMARY KEY,
  version text NOT NULL UNIQUE,
  generation bigint NOT NULL UNIQUE CHECK (generation >= 0),
  status text NOT NULL,
  checksum text NOT NULL,
  config_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL
);

CREATE TABLE venue_runtime_latest (
  venue text PRIMARY KEY,
  source_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE symbol_runtime_latest (
  venue text NOT NULL,
  symbol text NOT NULL,
  source_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (venue, symbol)
);
```

Also create the remaining tables from the spec with numeric columns for frequently aggregated daily metrics and JSONB only for bounded structured details.

- [ ] **Step 3: Add migration indexes**

At minimum:

- alerts by `resolved_at, level, started_at desc`.
- symbol daily by `day desc, venue, symbol`.
- venue daily by `day desc, venue`.
- audit by `created_at desc`.

- [ ] **Step 4: Run migrations and integration tests**

Run:

```bash
docker compose -f infra/docker-compose.dev.yml up -d postgres
cd apps/control-api
npm run db:migrate
npm run test:integration -- test/db/schema.integration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/control-api/src/db apps/control-api/drizzle* apps/control-api/test/db
git commit -m "feat(control): add VNext PostgreSQL operational schema"
```

---

### Task 7: Implement Telemetry Collector and Real Read Models

**Files:**
- Create: `dkivn-console/apps/control-api/src/telemetry/collector.ts`
- Create: `dkivn-console/apps/control-api/src/telemetry/upsert-runtime.ts`
- Create: `dkivn-console/apps/control-api/src/routes/runtime.ts`
- Test: `dkivn-console/apps/control-api/test/telemetry/collector.integration.test.ts`
- Test: `dkivn-console/apps/control-api/test/routes/runtime.test.ts`

**Interfaces:**
- Consumes: engine telemetry frames.
- Produces:
  - `GET /api/runtime/venues`
  - `GET /api/runtime/symbols`
  - `GET /api/runtime/symbols/:venue/:symbol`

- [ ] **Step 1: Write collector validation test**

Invalid telemetry must be rejected before persistence:

```ts
it("rejects a RUNNING venue payload with missing source age", async () => {
  const response = await injectTelemetry({
    venue: "TOOBIT",
    runtimeState: "RUNNING"
  });
  expect(response.statusCode).toBe(400);
  expect(await countRows("venue_runtime_latest")).toBe(0);
});
```

- [ ] **Step 2: Implement collector**

Collector must:

- parse with shared Zod schemas;
- batch DB writes;
- upsert latest venue/symbol read models;
- preserve source timestamp from engine;
- never overwrite a newer row with an older `sourceAt`.

Use SQL condition:

```sql
... ON CONFLICT (...) DO UPDATE
SET payload = EXCLUDED.payload,
    source_at = EXCLUDED.source_at,
    updated_at = now()
WHERE EXCLUDED.source_at >= venue_runtime_latest.source_at;
```

- [ ] **Step 3: Write stale read-model API test**

```ts
it("returns stale state explicitly rather than claiming online", async () => {
  await seedVenue({ venue: "TOOBIT", runtimeState: "RUNNING", sourceAgeMs: 9000 });
  const r = await api.get("/api/runtime/venues");
  expect(r.body[0].runtimeState).toBe("RUNNING");
  expect(r.body[0].stale).toBe(true);
});
```

The API preserves source truth and adds a derived `stale` flag; it does not rewrite RUNNING to another state.

- [ ] **Step 4: Implement runtime routes**

Response includes:

- sourceAt.
- serverNow.
- stale.
- all real metrics from persisted read model.

No sample/default trading values are returned if a row does not exist. Return `404` for detail routes or an empty list for collections.

- [ ] **Step 5: Run tests and commit**

```bash
npm test -- --run test/telemetry test/routes/runtime.test.ts
git add src/telemetry src/routes test/telemetry test/routes
git commit -m "feat(control): persist and expose real engine runtime telemetry"
```

---

### Task 8: Build Unified Alert Event Store and Telegram Dispatcher

**Files:**
- Create: `dkivn-console/apps/control-api/src/alerts/store.ts`
- Create: `dkivn-console/apps/control-api/src/alerts/dispatcher.ts`
- Create: `dkivn-console/apps/control-api/src/routes/alerts.ts`
- Test: `dkivn-console/apps/control-api/test/alerts/store.integration.test.ts`
- Test: `dkivn-console/apps/control-api/test/alerts/dispatcher.test.ts`

**Interfaces:**
- Consumes: validated `AlertEvent`.
- Produces:
  - `GET /api/alerts?active=true`
  - `GET /api/alerts/:id`
  - Telegram message derived from the same persisted event.

- [ ] **Step 1: Write deduplication test**

```ts
it("updates one active incident instead of creating Telegram spam", async () => {
  await store.upsert(alert({ fingerprint: "TOOBIT:XRP:COVERAGE", ageMs: 4000 }));
  await store.upsert(alert({ fingerprint: "TOOBIT:XRP:COVERAGE", ageMs: 9000 }));
  expect(await activeAlertCount("TOOBIT:XRP:COVERAGE")).toBe(1);
});
```

- [ ] **Step 2: Implement store**

An unresolved alert with the same fingerprint updates `last_seen_at`, `age_ms`, snapshot, and action. Resolution sets `resolved_at`; a later recurrence creates a new incident row.

- [ ] **Step 3: Write runtime-gated Telegram test**

```ts
it("does not send trading incident spam when venue is STOPPED and alert is non-actionable", async () => {
  const send = vi.fn();
  await dispatchAlert({
    alert: alert({ type: "HIGH_CHURN", level: "P2" }),
    runtimeState: "STOPPED",
    send
  });
  expect(send).not.toHaveBeenCalled();
});
```

P0 truth/ownership incidents may still be sent while stopped if exchange truth indicates a real open position/order requiring attention. The gating decision is based on alert type/actionability, not merely one global runtime boolean.

- [ ] **Step 4: Implement Markdown-safe Telegram formatting**

Escape Telegram MarkdownV2 special characters and format:

```text
🚨 DKIVN P0
TOOBIT · XRP-SWAP-USDT

Position / coverage divergence
Age: 9s
Action: HOLD_NEW_ORDERS
Truth age: 31ms
```

Do not put raw JSON or secrets in Telegram.

- [ ] **Step 5: Run tests and commit**

```bash
npm test -- --run test/alerts
git add src/alerts src/routes/alerts.ts test/alerts
git commit -m "feat(control): unify alert store and Telegram delivery"
```

---

### Task 9: Implement Safe Control API and Engine UDS Client

**Files:**
- Create: `dkivn-console/apps/control-api/src/ipc/engine-client.ts`
- Create: `dkivn-console/apps/control-api/src/routes/configs.ts`
- Create: `dkivn-console/apps/control-api/src/routes/commands.ts`
- Test: `dkivn-console/apps/control-api/test/ipc/engine-client.test.ts`
- Test: `dkivn-console/apps/control-api/test/routes/commands.test.ts`

**Interfaces:**
- Consumes: shared control contracts and PostgreSQL config records.
- Produces:
  - `POST /api/configs/drafts`
  - `PATCH /api/configs/drafts/:id`
  - `POST /api/configs/:id/promote` with target status up to SHADOW in Phase 1.
  - `POST /api/runtime/:venue/start`
  - `POST /api/runtime/:venue/pause`
  - `POST /api/runtime/:venue/resume`
  - `POST /api/runtime/:venue/disarm`
  - `POST /api/runtime/:venue/cancel-owned`

There is no generic place-order endpoint.

- [ ] **Step 1: Write generation allocation transaction test**

Two concurrent control requests must receive different monotonic generations.

Use a PostgreSQL sequence:

```sql
CREATE SEQUENCE dkivn_control_generation AS bigint START 1;
```

The API calls `nextval('dkivn_control_generation')` inside the command transaction.

- [ ] **Step 2: Write command failure consistency test**

If the engine rejects the UDS command, the API must not mark the promotion/runtime command as successfully applied.

- [ ] **Step 3: Implement EngineClient**

EngineClient:

- connects with a 500ms local timeout;
- writes exactly one framed command;
- requires matching `commandId`;
- validates response schema;
- never automatically retries a mutation command with a new commandId;
- exposes timeout as `ENGINE_CONTROL_TIMEOUT`.

- [ ] **Step 4: Implement config draft routes**

Draft save writes only PostgreSQL.

No engine command is sent until a promotion/action route is explicitly called.

- [ ] **Step 5: Implement runtime command routes**

The route validates operator authorization, allocates generation, persists audit intent, sends command, then records applied/rejected result.

- [ ] **Step 6: Add route enumeration test proving forbidden endpoint absence**

```ts
it("does not expose an arbitrary order mutation endpoint", async () => {
  const routes = app.printRoutes();
  expect(routes).not.toMatch(/place-order/i);
  expect(routes).not.toMatch(/cancel-order\//i);
});
```

- [ ] **Step 7: Run tests and commit**

```bash
npm test -- --run test/ipc test/routes/commands.test.ts
git add src/ipc src/routes test/ipc test/routes
git commit -m "feat(control): add fenced engine commands and config drafts"
```

---

### Task 10: Build Read-Only Apple-Style Operations Console

**Files:**
- Create: `dkivn-console/apps/web/app/page.tsx`
- Create: `dkivn-console/apps/web/app/venues/page.tsx`
- Create: `dkivn-console/apps/web/app/symbols/page.tsx`
- Create: `dkivn-console/apps/web/app/alerts/page.tsx`
- Create: `dkivn-console/apps/web/components/system-header.tsx`
- Create: `dkivn-console/apps/web/components/metric-card.tsx`
- Create: `dkivn-console/apps/web/components/venue-lane-card.tsx`
- Create: `dkivn-console/apps/web/components/symbols-table.tsx`
- Create: `dkivn-console/apps/web/components/alert-list.tsx`
- Create: `dkivn-console/apps/web/components/data-freshness.tsx`
- Create: `dkivn-console/apps/web/lib/api.ts`
- Test: `dkivn-console/apps/web/e2e/overview.spec.ts`
- Test: `dkivn-console/apps/web/e2e/venue-isolation.spec.ts`

**Interfaces:**
- Consumes: Control API read endpoints only.
- Produces: operational read-only UI for Phase 1.

- [ ] **Step 1: Establish visual tokens**

Use white operational surfaces, one dark text hierarchy, restrained semantic status colors, 10-12px radii, thin borders, and no decorative glass blur on dense tables.

Required visual hierarchy:

- top system header;
- primary KPI row;
- two venue execution-lane cards;
- symbol table;
- active alerts.

- [ ] **Step 2: Write no-fake-data browser test**

```ts
test("renders unknown state when runtime API has no venue row", async ({ page }) => {
  await page.route("**/api/runtime/venues", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.goto("/");
  await expect(page.getByText("No runtime data")).toBeVisible();
  await expect(page.getByText(/29,822/)).toHaveCount(0);
});
```

- [ ] **Step 3: Implement typed API client**

No client-side hard-coded fallback for:

- PnL.
- volume.
- maker ratio.
- wear.
- orders.
- inventory.
- latency.

Loading uses Skeleton; errors use Alert; stale values are labeled with source age.

- [ ] **Step 4: Implement Overview**

Required cards:

- Total Equity.
- Today Realized PnL.
- Today Volume.
- Rebate Accrued.
- Net Wear.
- Core Wear.
- Event Loop p99.
- GC Pause p99.

If total equity is not available from the Phase 1 read model, display `—` with source label rather than synthesizing it.

- [ ] **Step 5: Implement Venue Lane cards**

Each Toobit/Bitget card renders independently:

- runtime state;
- volume;
- maker ratio;
- realized PnL;
- Core Wear;
- active/max orders;
- net inventory;
- p99 latency;
- Public WS age;
- Private WS age;
- Truth age;
- coverage deficit.

- [ ] **Step 6: Implement Symbols table**

Columns:

```text
Symbol | Venue | Strategy | Regime | Orders | Long | Short | Net |
Volume | Maker | Bid EV | Ask EV | Toxicity | Markout500 | Alert
```

- [ ] **Step 7: Implement Alert Center**

Filters:

- active/resolved;
- P0/P1/P2;
- venue;
- symbol.

Every incident shows:

- start time;
- age;
- root cause;
- current action;
- last seen;
- resolved time.

- [ ] **Step 8: Write venue-isolation E2E test**

Mock Toobit as stale/error and Bitget as healthy; assert Bitget still renders ONLINE/RUNNING source truth and Toobit is visibly stale. The page must not collapse both venues into one global red/offline state.

- [ ] **Step 9: Run UI tests**

Run:

```bash
npm run lint
npm run test
npm run e2e
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web
git commit -m "feat(console): add real-data VNext operations dashboard"
```

---

### Task 11: Prove Process Isolation and Failure Semantics

**Files:**
- Create: `dkivn-console/infra/systemd/dkivn-control-api.service`
- Create: `dkivn-console/infra/systemd/dkivn-console.service`
- Create: `dkivn-engine/infra/systemd/dkivn-engine.service`
- Create: `dkivn-console/scripts/verify-isolation.sh`
- Create: `dkivn-console/scripts/verify-postgres-outage.sh`
- Create: `dkivn-console/docs/runbooks/vnext-phase1.md`

**Interfaces:**
- Consumes: deployed engine/control/console.
- Produces: machine-checkable Phase 1 acceptance evidence.

- [ ] **Step 1: Define separate systemd units**

Each unit has a unique `ExecStart`, `WorkingDirectory`, restart policy, and service user.

Console/control units MUST NOT list the engine as `PartOf=` or `BindsTo=`.

- [ ] **Step 2: Write isolation verification script**

```bash
#!/usr/bin/env bash
set -euo pipefail

ENGINE_PID_BEFORE="$(systemctl show -p MainPID --value dkivn-engine)"
curl -fsS http://127.0.0.1:8081/api/runtime/venues > /tmp/venues-before.json

sudo systemctl restart dkivn-console
sleep 2

ENGINE_PID_AFTER="$(systemctl show -p MainPID --value dkivn-engine)"

test "$ENGINE_PID_BEFORE" = "$ENGINE_PID_AFTER"
curl -fsS http://127.0.0.1:8081/api/runtime/venues > /tmp/venues-after.json

echo "PASS: console restart did not restart engine"
```

- [ ] **Step 3: Add engine telemetry proof to isolation script**

Before/after console restart, record engine-generated heartbeat sequence and require it to increase without resetting.

- [ ] **Step 4: Write PostgreSQL outage verification**

Procedure:

1. record engine PID, venue runtime generation and active-order count;
2. stop PostgreSQL;
3. verify engine process remains alive;
4. verify control API marks writes unavailable;
5. verify no unbounded telemetry memory growth over the bounded test interval;
6. restore PostgreSQL;
7. verify collector resumes and read model source timestamps advance.

- [ ] **Step 5: Add one-venue-failure verification**

Inject/force a Toobit ingress health failure in test/shadow environment and assert Bitget runtime command/state generation is unchanged.

- [ ] **Step 6: Run full Phase 1 acceptance suite**

Run:

```bash
./scripts/verify-isolation.sh
./scripts/verify-postgres-outage.sh
npm run test:all
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add infra scripts docs/runbooks
git commit -m "test(vnext): add process isolation and outage acceptance checks"
```

---

### Task 12: Phase 1 Deployment Gate and Read-Only Cutover

**Files:**
- Create: `dkivn-console/docs/releases/vnext-phase1-checklist.md`
- Modify: deployment manifests only; do not replace live strategy code in this task.

**Interfaces:**
- Consumes: all prior Phase 1 deliverables.
- Produces: independently deployable console/control plane observing existing live engine truth.

- [ ] **Step 1: Record pre-cutover baseline**

Capture:

- current engine commit/version;
- engine PID;
- Toobit/Bitget runtime states;
- active bot-owned orders;
- positions;
- coverage;
- Public WS age;
- Private WS age;
- Truth age.

- [ ] **Step 2: Deploy PostgreSQL + Control API + Console with control mutations disabled**

Set:

```text
DKIVN_CONTROL_MUTATIONS_ENABLED=false
```

Read telemetry and alerts only.

- [ ] **Step 3: Verify dashboard against exchange/runtime truth**

For both venues compare:

- active orders;
- positions/net inventory;
- runtime state;
- volume if exchange/runtime source provides it;
- source ages.

Document mismatches as blockers; do not create UI correction constants.

- [ ] **Step 4: Restart only the web console**

Require engine PID and engine heartbeat generation to remain continuous.

- [ ] **Step 5: Enable only safe control commands after isolation evidence**

Allow:

- START.
- PAUSE.
- RESUME.
- DISARM.
- CANCEL_OWNED.

Keep Strategy Config Live promotion disabled until Phase 3.

- [ ] **Step 6: Final regression**

Run contracts, engine control, telemetry, DB integration, API, and browser tests.

- [ ] **Step 7: Commit release evidence**

```bash
git add docs/releases
git commit -m "docs(vnext): record phase 1 foundation acceptance"
```

---

## Phase 1 Exit Criteria

Phase 1 is complete only when fresh evidence proves all of the following:

1. Restarting or redeploying `dkivn-console` does not restart `dkivn-engine`.
2. Restarting `dkivn-control-api` does not restart `dkivn-engine`.
3. The engine rejects stale control generations.
4. IPC frames are bounded and malformed frames cannot mutate runtime state.
5. StrategyConfig can be swapped without reconnecting exchange WebSockets.
6. Telemetry loss is bounded and cannot block the strategy thread.
7. PostgreSQL outage does not terminate live trading, but disables unsafe control-plane writes.
8. Toobit and Bitget read models and failure states remain independent.
9. Dashboard contains no fabricated fallback metrics.
10. Alert Center and Telegram use the same incident records.
11. No browser/control-plane arbitrary order mutation endpoint exists.
12. Phase 1 deployment remains strategy-neutral: no new Hybrid-MM/Grid/Cross-Venue strategy receives live authority.

## Deferred to Separate Plans

The following are intentionally not implemented in this plan because each is independently reviewable and testable:

- **Phase 2 — Research & Backtest:** Parquet ingestion, dataset manifest/versioning, Fast Backtest, L2 execution replay, empirical latency sampling, Queue Simulation, Symbol Scanner, Parkinson volatility, Hurst/regime scoring.
- **Phase 3 — Strategy Governance & Shadow/Canary:** Hybrid-MM shadow integration, Adaptive Grid clean-room implementation, Cross-Venue Arb clean-room implementation, Strategy Governor, comparison metrics, Canary controls, Live promotion/rollback.
