import { z } from "zod";
import { StrategyModeSchema, VenueSchema } from "./enums.js";

const NonNegative = z.number().finite().nonnegative();
const PositiveInt = z.number().int().positive();
const NonNegativeInt = z.number().int().nonnegative();
const DecimalGenerationSchema = z.string().regex(/^(0|[1-9]\d*)$/);

export const StrategyConfigSchema = z.object({
  strategyMode: StrategyModeSchema,
  quote: z.object({
    baseNotionalUsdt: z.number().finite().positive(),
    levels: PositiveInt,
    maxOrdersPerSymbol: PositiveInt,
    minQuoteLifeMs: PositiveInt,
    requoteThresholdBps: NonNegative,
    postOnly: z.literal(true),
  }),
  inventory: z.object({
    targetNetUsdt: z.number().finite(),
    softLimitUsdt: NonNegative,
    hardLimitUsdt: NonNegative,
    maxGrossUsdt: NonNegative,
  }),
  hybridMm: z.object({
    baseGamma: NonNegative,
    gammaToxicityMultiplier: NonNegative,
    gammaInventoryMultiplier: NonNegative,
    minHalfSpreadBps: NonNegative,
    minExpectedEvBps: z.number().finite(),
    toxicityHardStop: z.number().finite().min(0).max(1),
    markoutWindowMs: PositiveInt,
  }),
  grid: z.object({
    enabled: z.boolean(),
    spacingMode: z.enum(["FIXED", "VOLATILITY"]),
    fixedSpacingBps: NonNegative,
    maxLevels: PositiveInt,
    positionThresholdUsdt: NonNegative,
  }),
  crossVenue: z.object({
    enabled: z.boolean(),
    makerVenue: VenueSchema,
    hedgeVenue: VenueSchema,
    minNetSpreadBps: z.number().finite(),
    fillTimeoutMs: PositiveInt,
    maxHedgeLagMs: PositiveInt,
  }),
  risk: z.object({
    maxDailyLossUsdt: NonNegative,
    maxApiErrorStreak: PositiveInt,
    maxMarketAgeMs: PositiveInt,
    maxPrivateWsAgeMs: PositiveInt,
    maxTruthAgeMs: PositiveInt,
    maxCoverageDeficitUsdt: NonNegative,
  }),
}).superRefine((value, ctx) => {
  if (value.inventory.softLimitUsdt > value.inventory.hardLimitUsdt) {
    ctx.addIssue({
      code: "custom",
      path: ["inventory", "softLimitUsdt"],
      message: "soft inventory limit must be <= hard inventory limit",
    });
  }
  if (value.inventory.hardLimitUsdt > value.inventory.maxGrossUsdt) {
    ctx.addIssue({
      code: "custom",
      path: ["inventory", "hardLimitUsdt"],
      message: "hard inventory limit must be <= max gross inventory",
    });
  }
  if (value.quote.maxOrdersPerSymbol < value.quote.levels) {
    ctx.addIssue({
      code: "custom",
      path: ["quote", "maxOrdersPerSymbol"],
      message: "max orders per symbol must be >= quote levels",
    });
  }
  if (value.crossVenue.enabled && value.crossVenue.makerVenue === value.crossVenue.hedgeVenue) {
    ctx.addIssue({
      code: "custom",
      path: ["crossVenue", "hedgeVenue"],
      message: "maker and hedge venues must differ when cross-venue strategy is enabled",
    });
  }
});

export const StrategyConfigStatusSchema = z.enum([
  "DRAFT",
  "BACKTESTED",
  "SHADOW",
  "CANARY",
  "LIVE",
  "RETIRED",
]);

export const StrategyConfigEnvelopeSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  generation: DecimalGenerationSchema,
  createdAt: z.iso.datetime(),
  createdBy: z.string().min(1),
  status: StrategyConfigStatusSchema,
  venueScope: z.array(VenueSchema).min(1),
  symbolScope: z.array(z.string().min(1)).min(1),
  checksum: z.string().min(1),
  config: StrategyConfigSchema,
});

export type StrategyConfig = z.infer<typeof StrategyConfigSchema>;
export type StrategyConfigEnvelope = z.infer<typeof StrategyConfigEnvelopeSchema>;
export type StrategyConfigStatus = z.infer<typeof StrategyConfigStatusSchema>;
export { DecimalGenerationSchema };
