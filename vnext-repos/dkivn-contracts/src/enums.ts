import { z } from "zod";

export const VenueSchema = z.enum(["TOOBIT", "BITGET"]);
export type Venue = z.infer<typeof VenueSchema>;

export const RuntimeStateSchema = z.enum([
  "STOPPED",
  "READY",
  "RUNNING",
  "PAUSED",
  "RISK_REDUCE",
  "RECOVERING",
  "DISARMED",
]);
export type RuntimeState = z.infer<typeof RuntimeStateSchema>;

export const StrategyModeSchema = z.enum([
  "HYBRID_MM",
  "ADAPTIVE_GRID",
  "CROSS_VENUE_ARB",
  "INVENTORY_REDUCE",
]);
export type StrategyMode = z.infer<typeof StrategyModeSchema>;

export const OrderLifecycleStateSchema = z.enum([
  "IDLE",
  "PENDING_CREATE",
  "ACTIVE",
  "PARTIAL",
  "PENDING_CANCEL",
  "PENDING_AMEND",
  "UNKNOWN",
  "FILLED",
  "CANCELLED",
  "REJECTED",
  "FAILED",
]);
export type OrderLifecycleState = z.infer<typeof OrderLifecycleStateSchema>;
