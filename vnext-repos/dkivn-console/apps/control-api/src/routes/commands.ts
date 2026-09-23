import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import {
  ControlCommandSchema,
  VenueSchema,
  type ControlCommand,
} from "@dkivn/contracts";
import { allocateGeneration } from "../control/generation.js";
import type { EngineCommandClient } from "../ipc/engine-client.js";

type Authorize = (request: FastifyRequest) => string | null;

export interface RuntimeCommandRoutesOptions {
  pool: Pool;
  engineClient: EngineCommandClient;
  authorize: Authorize;
  commandId?: () => string;
}

const ACTION_TO_TYPE = {
  start: "START_VENUE",
  pause: "PAUSE_VENUE",
  resume: "RESUME_VENUE",
} as const;

async function audit(pool: Pool, actor: string, action: string, target: string, payload: unknown) {
  await pool.query(
    "INSERT INTO audit_log(actor, action, target, payload) VALUES ($1, $2, $3, $4::jsonb)",
    [actor, action, target, JSON.stringify(payload)],
  );
}

export function registerRuntimeCommandRoutes(app: FastifyInstance, options: RuntimeCommandRoutesOptions): void {
  const id = options.commandId ?? randomUUID;

  app.post<{ Params: { venue: string; action: keyof typeof ACTION_TO_TYPE } }>(
    "/api/runtime/:venue/:action",
    async (request, reply) => {
      const actor = options.authorize(request);
      if (!actor) return reply.code(401).send({ code: "UNAUTHORIZED" });

      const venue = VenueSchema.safeParse(request.params.venue);
      const type = ACTION_TO_TYPE[request.params.action];
      if (!venue.success || !type) return reply.code(404).send({ code: "COMMAND_NOT_FOUND" });

      const generation = await allocateGeneration(options.pool);
      const command = ControlCommandSchema.parse({
        protocolVersion: 1,
        commandId: id(),
        generation,
        type,
        venue: venue.data,
      }) as ControlCommand;

      await audit(options.pool, actor, "CONTROL_INTENT", venue.data, command);
      const response = await options.engineClient.send(command);
      if (!response.ok) {
        await audit(options.pool, actor, "CONTROL_REJECTED", venue.data, response);
        return reply.code(409).send(response);
      }
      await audit(options.pool, actor, "CONTROL_APPLIED", venue.data, response);
      return reply.code(200).send(response);
    },
  );

  app.post<{ Params: { venue: string }; Body: { reason?: string } }>(
    "/api/runtime/:venue/disarm",
    async (request, reply) => {
      const actor = options.authorize(request);
      if (!actor) return reply.code(401).send({ code: "UNAUTHORIZED" });
      const venue = VenueSchema.safeParse(request.params.venue);
      if (!venue.success) return reply.code(404).send({ code: "VENUE_NOT_FOUND" });
      const reason = request.body?.reason?.trim();
      if (!reason) return reply.code(400).send({ code: "DISARM_REASON_REQUIRED" });

      const generation = await allocateGeneration(options.pool);
      const command = ControlCommandSchema.parse({
        protocolVersion: 1,
        commandId: id(),
        generation,
        type: "DISARM_VENUE",
        venue: venue.data,
        reason,
      });
      await audit(options.pool, actor, "CONTROL_INTENT", venue.data, command);
      const response = await options.engineClient.send(command);
      if (!response.ok) {
        await audit(options.pool, actor, "CONTROL_REJECTED", venue.data, response);
        return reply.code(409).send(response);
      }
      await audit(options.pool, actor, "CONTROL_APPLIED", venue.data, response);
      return reply.send(response);
    },
  );

  app.post<{ Params: { venue: string }; Body: { symbol?: string } }>(
    "/api/runtime/:venue/cancel-owned",
    async (request, reply) => {
      const actor = options.authorize(request);
      if (!actor) return reply.code(401).send({ code: "UNAUTHORIZED" });
      const venue = VenueSchema.safeParse(request.params.venue);
      if (!venue.success) return reply.code(404).send({ code: "VENUE_NOT_FOUND" });

      const generation = await allocateGeneration(options.pool);
      const command = ControlCommandSchema.parse({
        protocolVersion: 1,
        commandId: id(),
        generation,
        type: "CANCEL_OWNED",
        venue: venue.data,
        ...(request.body?.symbol ? { symbol: request.body.symbol } : {}),
      });
      await audit(options.pool, actor, "CONTROL_INTENT", venue.data, command);
      const response = await options.engineClient.send(command);
      if (!response.ok) {
        await audit(options.pool, actor, "CONTROL_REJECTED", venue.data, response);
        return reply.code(409).send(response);
      }
      await audit(options.pool, actor, "CONTROL_APPLIED", venue.data, response);
      return reply.send(response);
    },
  );
}
