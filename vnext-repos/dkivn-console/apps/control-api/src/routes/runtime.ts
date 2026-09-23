import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

export interface RuntimeRoutesOptions {
  pool: Pool;
  staleAfterMs: number;
}

interface RuntimeRow {
  source_at: Date | string;
  updated_at: Date | string;
  payload: Record<string, unknown>;
}

function toMillis(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function presentRuntimeRow(row: RuntimeRow, staleAfterMs: number) {
  const serverNowMs = Date.now();
  const updatedAtMs = toMillis(row.updated_at);
  const storedAge = typeof row.payload.sourceAgeMs === "number" ? row.payload.sourceAgeMs : 0;
  const transportAge = Number.isFinite(updatedAtMs) ? Math.max(0, serverNowMs - updatedAtMs) : 0;
  const sourceAgeMs = storedAge + transportAge;

  return {
    ...row.payload,
    sourceAt: new Date(row.source_at).toISOString(),
    sourceAgeMs,
    serverNow: new Date(serverNowMs).toISOString(),
    stale: sourceAgeMs >= staleAfterMs,
  };
}

export function registerRuntimeRoutes(app: FastifyInstance, options: RuntimeRoutesOptions): void {
  app.get("/api/runtime/venues", async () => {
    const result = await options.pool.query<RuntimeRow>(
      "SELECT source_at, updated_at, payload FROM venue_runtime_latest ORDER BY venue",
    );
    return result.rows.map((row) => presentRuntimeRow(row, options.staleAfterMs));
  });

  app.get("/api/runtime/symbols", async () => {
    const result = await options.pool.query<RuntimeRow>(
      "SELECT source_at, updated_at, payload FROM symbol_runtime_latest ORDER BY venue, symbol",
    );
    return result.rows.map((row) => presentRuntimeRow(row, options.staleAfterMs));
  });

  app.get<{ Params: { venue: string; symbol: string } }>(
    "/api/runtime/symbols/:venue/:symbol",
    async (request, reply) => {
      const result = await options.pool.query<RuntimeRow>(
        `SELECT source_at, updated_at, payload
         FROM symbol_runtime_latest
         WHERE venue = $1 AND symbol = $2`,
        [request.params.venue, request.params.symbol],
      );

      const row = result.rows[0];
      if (!row) {
        return reply.code(404).send({ code: "RUNTIME_SYMBOL_NOT_FOUND" });
      }
      return presentRuntimeRow(row, options.staleAfterMs);
    },
  );
}
