import type { Pool } from "pg";
import type { SymbolTelemetry, VenueTelemetry } from "@dkivn/contracts";

export async function upsertVenueRuntime(pool: Pool, telemetry: VenueTelemetry): Promise<void> {
  await pool.query(
    `INSERT INTO venue_runtime_latest (venue, source_at, payload, updated_at)
     VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (venue) DO UPDATE
     SET source_at = EXCLUDED.source_at,
         payload = EXCLUDED.payload,
         updated_at = now()
     WHERE EXCLUDED.source_at >= venue_runtime_latest.source_at`,
    [telemetry.venue, telemetry.sourceAt, JSON.stringify(telemetry)],
  );
}

export async function upsertSymbolRuntime(pool: Pool, telemetry: SymbolTelemetry): Promise<void> {
  await pool.query(
    `INSERT INTO symbol_runtime_latest (venue, symbol, source_at, payload, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, now())
     ON CONFLICT (venue, symbol) DO UPDATE
     SET source_at = EXCLUDED.source_at,
         payload = EXCLUDED.payload,
         updated_at = now()
     WHERE EXCLUDED.source_at >= symbol_runtime_latest.source_at`,
    [telemetry.venue, telemetry.symbol, telemetry.sourceAt, JSON.stringify(telemetry)],
  );
}
