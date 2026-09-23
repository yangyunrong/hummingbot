import { afterAll, beforeEach, describe, expect, it } from "vitest";
import Fastify from "fastify";
import pg from "pg";
import { AlertStore } from "../../src/alerts/store.js";
import { registerAlertRoutes } from "../../src/routes/alerts.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const store = new AlertStore(pool);

beforeEach(async () => {
  await pool.query("TRUNCATE alerts");
});

afterAll(async () => {
  await pool.end();
});

describe("alert routes", () => {
  it("returns only active alerts when active=true", async () => {
    const now = new Date().toISOString();
    await store.upsert({
      id: "active-1", fingerprint: "A", level: "P1", venue: "BITGET", symbol: "BTC-SWAP-USDT",
      type: "PRIVATE_WS_STALE", startedAt: now, firstSeenMonoNs: "1", lastSeenAt: now, ageMs: 100,
      rootCauseCode: "WS_STALE", summary: "Private WS stale", truthSnapshot: {}, automaticAction: "HOLD_NEW_ORDERS", resolvedAt: null,
    });

    const app = Fastify();
    registerAlertRoutes(app, { pool });
    const response = await app.inject({ method: "GET", url: "/api/alerts?active=true" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].id).toBe("active-1");
    await app.close();
  });
});
