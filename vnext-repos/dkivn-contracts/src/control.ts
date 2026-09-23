import { z } from "zod";
import { VenueSchema } from "./enums.js";
import {
  DecimalGenerationSchema,
  StrategyConfigEnvelopeSchema,
} from "./strategy-config.js";

const BaseControlCommand = z.object({
  protocolVersion: z.literal(1),
  commandId: z.string().min(1),
  generation: DecimalGenerationSchema,
});

const ApplyConfigCommand = BaseControlCommand.extend({
  type: z.literal("APPLY_CONFIG"),
  config: StrategyConfigEnvelopeSchema,
});

const StartVenueCommand = BaseControlCommand.extend({
  type: z.literal("START_VENUE"),
  venue: VenueSchema,
});

const PauseVenueCommand = BaseControlCommand.extend({
  type: z.literal("PAUSE_VENUE"),
  venue: VenueSchema,
});

const ResumeVenueCommand = BaseControlCommand.extend({
  type: z.literal("RESUME_VENUE"),
  venue: VenueSchema,
});

const DisarmVenueCommand = BaseControlCommand.extend({
  type: z.literal("DISARM_VENUE"),
  venue: VenueSchema,
  reason: z.string().min(1),
});

const CancelOwnedCommand = BaseControlCommand.extend({
  type: z.literal("CANCEL_OWNED"),
  venue: VenueSchema,
  symbol: z.string().min(1).optional(),
});

export const ControlCommandSchema = z.discriminatedUnion("type", [
  ApplyConfigCommand,
  StartVenueCommand,
  PauseVenueCommand,
  ResumeVenueCommand,
  DisarmVenueCommand,
  CancelOwnedCommand,
]);

export const ControlResponseSchema = z.object({
  protocolVersion: z.literal(1),
  commandId: z.string().min(1),
  ok: z.boolean(),
  code: z.string().min(1),
  appliedGeneration: DecimalGenerationSchema,
  message: z.string().optional(),
});

export type ControlCommand = z.infer<typeof ControlCommandSchema>;
export type ControlResponse = z.infer<typeof ControlResponseSchema>;
