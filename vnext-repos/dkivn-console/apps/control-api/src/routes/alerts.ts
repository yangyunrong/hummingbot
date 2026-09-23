import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

export interface AlertRoutesOptions {
  pool: Pool;
}

interface AlertRow {
  id: string;
  fingerprint: string;
  level: string;
  venue: string | null;
  symbol: string | null;
  type: string;
  started_at: Date | string;
  first_seen_mono_ns: string;
  last_seen_at: Date | string;
  age_ms: string | number;
  root_cause_code: string;
  summary: string;
  truth_snapshot: Record<string, unknown>;
  automatic_action: string;
  resolved_at: Date | string | null;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return new Date(value).toISOString();
}

function present(row: AlertRow) {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    level: row.level,
    venue: row.venue,
    symbol: row.symbol,
    type: row.type,
    startedAt: iso(row.started_at),
    firstSeenMonoNs: row.first_seen_mono_ns,
    lastSeenAt: iso(row.last_seen_at),
    ageMs: Number(row.age_ms),
    rootCauseCode: row.root_cause_code,
    summary: row.summary,
    truthSnapshot: row.truth_snapshot,
    automaticAction: row.automatic_action,
    resolvedAt: iso(row.resolved_at),
  };
}

export function registerAlertRoutes(app: FastifyInstance, options: AlertRoutesOptions): void {
  app.get<{ Querystring: { active?: string; level?: string; venue?: string; symbol?: string } }>(
    "/api/alerts",
    async (request) => {
      const clauses: string[] = [];
      const values: string[] = [];

      if (request.query.active === "true") clauses.push("resolved_at IS NULL");
      if (request.query.active === "false") clauses.push("resolved_at IS NOT NULL");

      for (const [column, value] of [
        ["level", request.query.level],
        ["venue", request.query.venue],
        ["symbol", request.query.symbol],
      ] as const) {
        if (value) {
          values.push(value);
          clauses.push(`${column} = $${values.length}`);
        }
      }

      const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const result = await options.pool.query<AlertRow>(
        `SELECT *
         FROM alerts
         ${where}
         ORDER BY resolved_at NULLS FIRST, started_at DESC`,
        values,
      );
      return result.rows.map(present);
    },
  );

  app.get<{ Params: { id: string } }>("/api/alerts/:id", async (request, reply) => {
    const result = await options.pool.query<AlertRow>(
      "SELECT * FROM alerts WHERE id = $1",
      [request.params.id],
    );
    const row = result.rows[0];
    if (!row) return reply.code(404).send({ code: "ALERT_NOT_FOUND" });
    return present(row);
  });
}
