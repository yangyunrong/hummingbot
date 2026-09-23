import type { Pool } from "pg";
import { AlertEventSchema, type AlertEvent } from "@dkivn/contracts";

interface ActiveAlertRow {
  id: string;
}

export class AlertStore {
  constructor(private readonly pool: Pool) {}

  async upsert(input: AlertEvent): Promise<void> {
    const alert = AlertEventSchema.parse(input);
    const active = await this.pool.query<ActiveAlertRow>(
      `SELECT id
       FROM alerts
       WHERE fingerprint = $1 AND resolved_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1`,
      [alert.fingerprint],
    );

    const existing = active.rows[0];
    if (existing) {
      await this.pool.query(
        `UPDATE alerts
         SET level = $2,
             venue = $3,
             symbol = $4,
             type = $5,
             last_seen_at = $6,
             age_ms = $7,
             root_cause_code = $8,
             summary = $9,
             truth_snapshot = $10::jsonb,
             automatic_action = $11,
             resolved_at = $12
         WHERE id = $1`,
        [
          existing.id,
          alert.level,
          alert.venue,
          alert.symbol,
          alert.type,
          alert.lastSeenAt,
          alert.ageMs,
          alert.rootCauseCode,
          alert.summary,
          JSON.stringify(alert.truthSnapshot),
          alert.automaticAction,
          alert.resolvedAt,
        ],
      );
      return;
    }

    await this.pool.query(
      `INSERT INTO alerts (
         id, fingerprint, level, venue, symbol, type,
         started_at, first_seen_mono_ns, last_seen_at, age_ms,
         root_cause_code, summary, truth_snapshot, automatic_action, resolved_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12, $13::jsonb, $14, $15
       )`,
      [
        alert.id,
        alert.fingerprint,
        alert.level,
        alert.venue,
        alert.symbol,
        alert.type,
        alert.startedAt,
        alert.firstSeenMonoNs,
        alert.lastSeenAt,
        alert.ageMs,
        alert.rootCauseCode,
        alert.summary,
        JSON.stringify(alert.truthSnapshot),
        alert.automaticAction,
        alert.resolvedAt,
      ],
    );
  }
}
