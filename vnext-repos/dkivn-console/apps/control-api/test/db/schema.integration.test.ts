import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

afterAll(async () => {
  await pool.end();
});

async function tableExists(name: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS present`,
    [name],
  );
  return result.rows[0]?.present === true;
}

describe("VNext PostgreSQL foundation schema", () => {
  it("creates all required operational tables", async () => {
    const required = [
      "strategy_configs",
      "strategy_promotions",
      "venue_runtime_latest",
      "symbol_runtime_latest",
      "venue_daily_metrics",
      "symbol_daily_metrics",
      "alerts",
      "audit_log",
    ];
    for (const table of required) {
      expect(await tableExists(table), table).toBe(true);
    }
  });

  it("enforces unique strategy version and generation", async () => {
    const r = await pool.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'strategy_configs'::regclass
        AND contype = 'u'
      ORDER BY conname
    `);
    const names = r.rows.map((row) => String(row.conname));
    expect(names.some((name) => name.includes("version"))).toBe(true);
    expect(names.some((name) => name.includes("generation"))).toBe(true);
  });

  it("enforces one latest runtime row per venue and per venue-symbol", async () => {
    const venue = await pool.query(`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'venue_runtime_latest'
    `);
    expect(venue.rows.some((row) => String(row.indexdef).includes("UNIQUE"))).toBe(true);

    const symbol = await pool.query(`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'symbol_runtime_latest'
    `);
    expect(symbol.rows.some((row) => String(row.indexdef).includes("venue") && String(row.indexdef).includes("symbol"))).toBe(true);
  });

  it("creates alert and daily-metric query indexes", async () => {
    const r = await pool.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
    `);
    const names = new Set(r.rows.map((row) => String(row.indexname)));
    expect(names.has("alerts_active_level_started_idx")).toBe(true);
    expect(names.has("symbol_daily_day_venue_symbol_idx")).toBe(true);
    expect(names.has("venue_daily_day_venue_idx")).toBe(true);
    expect(names.has("audit_log_created_at_idx")).toBe(true);
  });
});
