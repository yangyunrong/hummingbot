import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import pg from "pg";
import { registerConfigRoutes } from "../../src/routes/configs.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

beforeEach(async () => {
  await pool.query("TRUNCATE strategy_promotions, strategy_configs CASCADE");
});

afterAll(async () => {
  await pool.end();
});

function draft() {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    version: "v18.4.3-draft",
    createdAt: new Date().toISOString(),
    createdBy: "operator",
    venueScope: ["TOOBIT"],
    symbolScope: ["BTC-SWAP-USDT"],
    checksum: "sha256:test",
    config: {
      strategyMode: "HYBRID_MM",
      quote: { baseNotionalUsdt: 10, levels: 5, maxOrdersPerSymbol: 10, minQuoteLifeMs: 2500, requoteThresholdBps: 2, postOnly: true },
      inventory: { targetNetUsdt: 0, softLimitUsdt: 10, hardLimitUsdt: 20, maxGrossUsdt: 40 },
      hybridMm: { baseGamma: 0.05, gammaToxicityMultiplier: 2, gammaInventoryMultiplier: 2, minHalfSpreadBps: 1, minExpectedEvBps: 0, toxicityHardStop: 0.9, markoutWindowMs: 500 },
      grid: { enabled: false, spacingMode: "VOLATILITY", fixedSpacingBps: 4, maxLevels: 5, positionThresholdUsdt: 20 },
      crossVenue: { enabled: false, makerVenue: "TOOBIT", hedgeVenue: "BITGET", minNetSpreadBps: 2, fillTimeoutMs: 5000, maxHedgeLagMs: 250 },
      risk: { maxDailyLossUsdt: 2, maxApiErrorStreak: 3, maxMarketAgeMs: 2000, maxPrivateWsAgeMs: 2000, maxTruthAgeMs: 2000, maxCoverageDeficitUsdt: 0 },
    },
  };
}

describe("config drafts", () => {
  it("saving a draft persists it without contacting the engine", async () => {
    const send = vi.fn();
    const app = Fastify();
    registerConfigRoutes(app, {
      pool,
      engineClient: { send },
      authorize: () => "operator",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/configs/drafts",
      payload: draft(),
    });
    expect(response.statusCode).toBe(201);
    expect(send).not.toHaveBeenCalled();

    const result = await pool.query("SELECT status FROM strategy_configs");
    expect(result.rows[0].status).toBe("DRAFT");
    await app.close();
  });
});
