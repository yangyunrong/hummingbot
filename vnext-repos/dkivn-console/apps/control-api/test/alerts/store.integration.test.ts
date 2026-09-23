import { afterAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { AlertStore } from "../../src/alerts/store.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const store = new AlertStore(pool);

function alert(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: "alert-1",
    fingerprint: "TOOBIT:XRP:COVERAGE",
    level: "P0",
    venue: "TOOBIT",
    symbol: "XRP-SWAP-USDT",
    type: "POSITION_COVERAGE_DIVERGENCE",
    startedAt: now,
    firstSeenMonoNs: "1000",
    lastSeenAt: now,
    ageMs: 4000,
    rootCauseCode: "COVERAGE_DEFICIT",
    summary: "Position / coverage divergence",
    truthSnapshot: { positionQty: 1, coverageDeficitUsdt: 2 },
    automaticAction: "HOLD_NEW_ORDERS",
    resolvedAt: null,
    ...overrides,
  };
}

beforeEach(async () => {
  await pool.query("TRUNCATE alerts");
});

afterAll(async () => {
  await pool.end();
});

describe("AlertStore", () => {
  it("updates one unresolved incident instead of inserting alert spam", async () => {
    await store.upsert(alert());
    await store.upsert(alert({
      id: "alert-2",
      ageMs: 9000,
      lastSeenAt: new Date(Date.now() + 5000).toISOString(),
    }));

    const result = await pool.query(
      "SELECT id, age_ms, fingerprint FROM alerts WHERE fingerprint = $1",
      ["TOOBIT:XRP:COVERAGE"],
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].id).toBe("alert-1");
    expect(Number(result.rows[0].age_ms)).toBe(9000);
  });

  it("creates a new incident after the prior occurrence was resolved", async () => {
    const started = new Date().toISOString();
    await store.upsert(alert({ startedAt: started }));
    await store.upsert(alert({
      resolvedAt: new Date(Date.now() + 1000).toISOString(),
      lastSeenAt: new Date(Date.now() + 1000).toISOString(),
    }));
    await store.upsert(alert({
      id: "alert-3",
      startedAt: new Date(Date.now() + 2000).toISOString(),
      lastSeenAt: new Date(Date.now() + 2000).toISOString(),
      ageMs: 1000,
      resolvedAt: null,
    }));

    const result = await pool.query(
      "SELECT id, resolved_at FROM alerts WHERE fingerprint = $1 ORDER BY started_at",
      ["TOOBIT:XRP:COVERAGE"],
    );
    expect(result.rowCount).toBe(2);
    expect(result.rows[0].resolved_at).not.toBeNull();
    expect(result.rows[1].id).toBe("alert-3");
  });
});
