import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import {
  StrategyConfigEnvelopeSchema,
  type StrategyConfigEnvelope,
} from "@dkivn/contracts";
import { allocateGeneration } from "../control/generation.js";
import type { EngineCommandClient } from "../ipc/engine-client.js";

type Authorize = (request: FastifyRequest) => string | null;

export interface ConfigRoutesOptions {
  pool: Pool;
  engineClient: EngineCommandClient;
  authorize: Authorize;
}

export function registerConfigRoutes(app: FastifyInstance, options: ConfigRoutesOptions): void {
  app.post("/api/configs/drafts", async (request, reply) => {
    const actor = options.authorize(request);
    if (!actor) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const body = request.body as Record<string, unknown>;
    const generation = await allocateGeneration(options.pool);
    const parsed = StrategyConfigEnvelopeSchema.safeParse({
      ...body,
      generation,
      status: "DRAFT",
    });
    if (!parsed.success) {
      return reply.code(400).send({ code: "INVALID_STRATEGY_CONFIG", issues: parsed.error.issues });
    }
    const envelope = parsed.data;
    await options.pool.query(
      `INSERT INTO strategy_configs(id, version, generation, status, checksum, config_json, created_at, created_by)
       VALUES ($1, $2, $3, 'DRAFT', $4, $5::jsonb, $6, $7)`,
      [
        envelope.id,
        envelope.version,
        envelope.generation,
        envelope.checksum,
        JSON.stringify(envelope),
        envelope.createdAt,
        envelope.createdBy,
      ],
    );
    return reply.code(201).send(envelope);
  });

  app.patch<{ Params: { id: string } }>("/api/configs/drafts/:id", async (request, reply) => {
    const actor = options.authorize(request);
    if (!actor) return reply.code(401).send({ code: "UNAUTHORIZED" });

    const existing = await options.pool.query<{ config_json: StrategyConfigEnvelope; status: string }>(
      "SELECT config_json, status FROM strategy_configs WHERE id = $1",
      [request.params.id],
    );
    const row = existing.rows[0];
    if (!row) return reply.code(404).send({ code: "CONFIG_NOT_FOUND" });
    if (row.status !== "DRAFT") return reply.code(409).send({ code: "CONFIG_NOT_DRAFT" });

    const body = request.body as Record<string, unknown>;
    const parsed = StrategyConfigEnvelopeSchema.safeParse({
      ...row.config_json,
      ...body,
      id: request.params.id,
      generation: row.config_json.generation,
      status: "DRAFT",
    });
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_STRATEGY_CONFIG", issues: parsed.error.issues });

    await options.pool.query(
      "UPDATE strategy_configs SET checksum = $2, config_json = $3::jsonb WHERE id = $1",
      [request.params.id, parsed.data.checksum, JSON.stringify(parsed.data)],
    );
    return reply.send(parsed.data);
  });

  app.post<{ Params: { id: string }; Body: { targetStatus?: string } }>(
    "/api/configs/:id/promote",
    async (request, reply) => {
      const actor = options.authorize(request);
      if (!actor) return reply.code(401).send({ code: "UNAUTHORIZED" });
      const targetStatus = request.body?.targetStatus;
      if (targetStatus !== "BACKTESTED" && targetStatus !== "SHADOW") {
        return reply.code(400).send({ code: "PHASE1_PROMOTION_TARGET_INVALID" });
      }

      const existing = await options.pool.query<{ config_json: StrategyConfigEnvelope; status: string }>(
        "SELECT config_json, status FROM strategy_configs WHERE id = $1",
        [request.params.id],
      );
      const row = existing.rows[0];
      if (!row) return reply.code(404).send({ code: "CONFIG_NOT_FOUND" });

      const generation = await allocateGeneration(options.pool);
      const promoted = StrategyConfigEnvelopeSchema.parse({
        ...row.config_json,
        generation,
        status: targetStatus,
      });

      if (targetStatus === "SHADOW") {
        const command = {
          protocolVersion: 1 as const,
          commandId: `config-${request.params.id}-${generation}`,
          generation,
          type: "APPLY_CONFIG" as const,
          config: promoted,
        };
        const response = await options.engineClient.send(command);
        if (!response.ok) return reply.code(409).send(response);
      }

      await options.pool.query(
        `INSERT INTO strategy_promotions(
           config_id, from_status, to_status, venue_scope, symbol_scope, promoted_by, validation_result_json
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          request.params.id,
          row.status,
          targetStatus,
          promoted.venueScope,
          promoted.symbolScope,
          actor,
          JSON.stringify({ generation, accepted: true }),
        ],
      );
      return reply.send(promoted);
    },
  );
}
