import { beforeEach, afterAll, describe, expect, it } from "vitest";
import Fastify from "fastify";
import pg from "pg";
import { registerTelemetryCollectorRoutes } from "../../src/telemetry/collector.js";
import { registerRuntimeRoutes } from "../../src/routes/runtime.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function venue(overrides: Record<string, unknown> = {}) {
  return {
    venue: "TOOBIT",
    runtimeState: "RUNNING",
    sourceAt: new Date().toISOString(),
    sourceAgeMs: 10,
    publicWsAgeMs: 10,
    privateWsAgeMs: 12,
    truthAgeMs: 15,
    todayVolumeUsdt: 1000,
    makerVolumeUsdt: 950,
    takerVolumeUsdt: 50,
    realizedPnlUsdt: 1.2,
    feesUsdt: -0.3,
    rebateUsdt: 0.8,
    fundingUsdt: 0,
    coreWearBps: -0.2,
    netWearBps: 0.4,
    activeOrders: 4,
    maxOrders: 10,
    netInventoryUsdt: 2,
    coverageDeficitUsdt: 0,
    latency: {
      sendToAckP50Ms: 20,
      sendToAckP95Ms: 35,
      sendToAckP99Ms: 45,
      eventLoopP99Ms: 0.5,
      gcPauseP99Ms: 0.1
    },
    ...overrides,
  };
}

function symbol(overrides: Record<string, unknown> = {}) {
  return {
    venue: "TOOBIT",
    symbol: "BTC-SWAP-USDT",
    sourceAt: new Date().toISOString(),
    sourceAgeMs: 10,
    strategyMode: "HYBRID_MM",
    regime: "RANGE",
    activeOrders: 4,
    maxOrders: 10,
    longInventoryUsdt: 5,
    shortInventoryUsdt: 3,
    netInventoryUsdt: 2,
    todayVolumeUsdt: 1000,
    makerRatio: 0.95,
    bidEvBps: 0.2,
    askEvBps: 0.25,
    toxicity: 0.1,
    markout500Bps: -0.05,
    alertLevel: null,
    ...overrides,
  };
}

async function app() {
  const instance = Fastify();
  registerTelemetryCollectorRoutes(instance, { pool });
  registerRuntimeRoutes(instance, { pool, staleAfterMs: 2000 });
  return instance;
}

beforeEach(async () => {
  await pool.query("TRUNCATE venue_runtime_latest, symbol_runtime_latest");
});

afterAll(async () => {
  await pool.end();
});

describe("telemetry collector and runtime read models", () => {
  it("rejects invalid venue telemetry before persistence", async () => {
    const server = await app();
    const response = await server.inject({
      method: "POST",
      url: "/internal/telemetry/venue",
      payload: { venue: "TOOBIT", runtimeState: "RUNNING" },
    });
    expect(response.statusCode).toBe(400);
    const count = await pool.query("SELECT count(*)::int AS n FROM venue_runtime_latest");
    expect(count.rows[0].n).toBe(0);
    await server.close();
  });

  it("never overwrites newer venue truth with older telemetry", async () => {
    const server = await app();
    const newer = new Date("2026-09-23T06:00:02.000Z").toISOString();
    const older = new Date("2026-09-23T06:00:01.000Z").toISOString();

    expect((await server.inject({ method: "POST", url: "/internal/telemetry/venue", payload: venue({ sourceAt: newer, todayVolumeUsdt: 200 }) })).statusCode).toBe(204);
    expect((await server.inject({ method: "POST", url: "/internal/telemetry/venue", payload: venue({ sourceAt: older, todayVolumeUsdt: 100 }) })).statusCode).toBe(204);

    const row = await pool.query("SELECT source_at, payload FROM venue_runtime_latest WHERE venue = 'TOOBIT'");
    expect(new Date(row.rows[0].source_at).toISOString()).toBe(newer);
    expect(row.rows[0].payload.todayVolumeUsdt).toBe(200);
    await server.close();
  });

  it("returns stale explicitly while preserving source runtime state", async () => {
    const server = await app();
    await server.inject({
      method: "POST",
      url: "/internal/telemetry/venue",
      payload: venue({ sourceAgeMs: 9000 }),
    });

    const response = await server.inject({ method: "GET", url: "/api/runtime/venues" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body[0].runtimeState).toBe("RUNNING");
    expect(body[0].stale).toBe(true);
    expect(body[0].sourceAgeMs).toBeGreaterThanOrEqual(9000);
    await server.close();
  });

  it("returns empty collections and 404 detail instead of fabricated values", async () => {
    const server = await app();
    expect((await server.inject({ method: "GET", url: "/api/runtime/venues" })).json()).toEqual([]);
    expect((await server.inject({ method: "GET", url: "/api/runtime/symbols" })).json()).toEqual([]);
    expect((await server.inject({ method: "GET", url: "/api/runtime/symbols/TOOBIT/BTC-SWAP-USDT" })).statusCode).toBe(404);
    await server.close();
  });

  it("persists and reads symbol telemetry", async () => {
    const server = await app();
    expect((await server.inject({ method: "POST", url: "/internal/telemetry/symbol", payload: symbol() })).statusCode).toBe(204);
    const response = await server.inject({ method: "GET", url: "/api/runtime/symbols" });
    expect(response.statusCode).toBe(200);
    expect(response.json()[0].symbol).toBe("BTC-SWAP-USDT");
    await server.close();
  });
});
