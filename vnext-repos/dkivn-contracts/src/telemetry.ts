import { z } from "zod";
import {
  MarketRegimeSchema,
  RuntimeStateSchema,
  StrategyModeSchema,
  VenueSchema,
} from "./enums.js";

const NonNegative = z.number().finite().nonnegative();
const Finite = z.number().finite();
const AgeMs = z.number().finite().nonnegative();
const Count = z.number().int().nonnegative();

export const LatencySummarySchema = z.object({
  sendToAckP50Ms: NonNegative,
  sendToAckP95Ms: NonNegative,
  sendToAckP99Ms: NonNegative,
  eventLoopP99Ms: NonNegative,
  gcPauseP99Ms: NonNegative,
});

export const VenueTelemetrySchema = z.object({
  venue: VenueSchema,
  runtimeState: RuntimeStateSchema,
  sourceAt: z.iso.datetime(),
  sourceAgeMs: AgeMs,
  publicWsAgeMs: AgeMs,
  privateWsAgeMs: AgeMs,
  truthAgeMs: AgeMs,
  todayVolumeUsdt: NonNegative,
  makerVolumeUsdt: NonNegative,
  takerVolumeUsdt: NonNegative,
  realizedPnlUsdt: Finite,
  feesUsdt: Finite,
  rebateUsdt: Finite,
  fundingUsdt: Finite,
  coreWearBps: Finite,
  netWearBps: Finite,
  activeOrders: Count,
  maxOrders: Count,
  netInventoryUsdt: Finite,
  coverageDeficitUsdt: NonNegative,
  latency: LatencySummarySchema,
});

export const SymbolTelemetrySchema = z.object({
  venue: VenueSchema,
  symbol: z.string().min(1),
  sourceAt: z.iso.datetime(),
  sourceAgeMs: AgeMs,
  strategyMode: StrategyModeSchema,
  regime: MarketRegimeSchema,
  activeOrders: Count,
  maxOrders: Count,
  longInventoryUsdt: NonNegative,
  shortInventoryUsdt: NonNegative,
  netInventoryUsdt: Finite,
  todayVolumeUsdt: NonNegative,
  makerRatio: z.number().finite().min(0).max(1),
  bidEvBps: Finite,
  askEvBps: Finite,
  toxicity: z.number().finite().min(0).max(1),
  markout500Bps: Finite,
  alertLevel: z.enum(["P0", "P1", "P2"]).nullable(),
});

export type VenueTelemetry = z.infer<typeof VenueTelemetrySchema>;
export type SymbolTelemetry = z.infer<typeof SymbolTelemetrySchema>;
