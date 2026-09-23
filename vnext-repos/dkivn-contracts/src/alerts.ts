import { z } from "zod";
import { VenueSchema } from "./enums.js";
import { DecimalGenerationSchema } from "./strategy-config.js";

export const AlertLevelSchema = z.enum(["P0", "P1", "P2"]);

export const AlertTypeSchema = z.enum([
  "POSITION_COVERAGE_DIVERGENCE",
  "UNKNOWN_ORDER",
  "SELF_CROSS",
  "TRUTH_UNSYNCED",
  "PRIVATE_WS_STALE",
  "PUBLIC_WS_STALE",
  "RATE_LIMIT",
  "NEGATIVE_MARKOUT",
  "HIGH_TOXICITY",
  "ORDER_SLOT_SATURATED",
  "HIGH_CHURN",
  "LATENCY_DEGRADED",
  "BACKTEST_LIVE_DRIFT",
]);

export const AlertAutomaticActionSchema = z.enum([
  "NONE",
  "HOLD_NEW_ORDERS",
  "CANCEL_OWNED",
  "RISK_REDUCE",
  "DISARM",
]);

export const AlertEventSchema = z.object({
  id: z.string().min(1),
  fingerprint: z.string().min(1),
  level: AlertLevelSchema,
  venue: VenueSchema.nullable(),
  symbol: z.string().min(1).nullable(),
  type: AlertTypeSchema,
  startedAt: z.iso.datetime(),
  firstSeenMonoNs: DecimalGenerationSchema,
  lastSeenAt: z.iso.datetime(),
  ageMs: z.number().finite().nonnegative(),
  rootCauseCode: z.string().min(1),
  summary: z.string().min(1),
  truthSnapshot: z.record(z.string(), z.unknown()),
  automaticAction: AlertAutomaticActionSchema,
  resolvedAt: z.iso.datetime().nullable(),
});

export type AlertEvent = z.infer<typeof AlertEventSchema>;
