import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { SymbolTelemetrySchema, VenueTelemetrySchema } from "@dkivn/contracts";
import { upsertSymbolRuntime, upsertVenueRuntime } from "./upsert-runtime.js";

export interface TelemetryCollectorOptions {
  pool: Pool;
}

export function registerTelemetryCollectorRoutes(
  app: FastifyInstance,
  options: TelemetryCollectorOptions,
): void {
  app.post("/internal/telemetry/venue", async (request, reply) => {
    const parsed = VenueTelemetrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "INVALID_VENUE_TELEMETRY",
        issues: parsed.error.issues,
      });
    }

    await upsertVenueRuntime(options.pool, parsed.data);
    return reply.code(204).send();
  });

  app.post("/internal/telemetry/symbol", async (request, reply) => {
    const parsed = SymbolTelemetrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "INVALID_SYMBOL_TELEMETRY",
        issues: parsed.error.issues,
      });
    }

    await upsertSymbolRuntime(options.pool, parsed.data);
    return reply.code(204).send();
  });
}
