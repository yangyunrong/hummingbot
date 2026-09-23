import { describe, expect, it } from "vitest";
import {
  AlertEventSchema,
  ControlCommandSchema,
  StrategyConfigEnvelopeSchema,
  VenueTelemetrySchema,
} from "../src/index.js";

const validConfig = {
  id: "cfg_1",
  version: "v18.4.3",
  generation: "1843",
  createdAt: "2026-09-23T05:00:00.000Z",
  createdBy: "operator",
  status: "DRAFT",
  venueScope: ["TOOBIT"],
  symbolScope: ["BTC-SWAP-USDT"],
  checksum: "sha256:abc",
  config: {
    strategyMode: "HYBRID_MM",
    quote: {
      baseNotionalUsdt: 10,
      levels: 5,
      maxOrdersPerSymbol: 10,
      minQuoteLifeMs: 2500,
      requoteThresholdBps: 2,
      postOnly: true
    },
    inventory: {
      targetNetUsdt: 0,
      softLimitUsdt: 10,
      hardLimitUsdt: 20,
      maxGrossUsdt: 40
    },
    hybridMm: {
      baseGamma: 0.05,
      gammaToxicityMultiplier: 2,
      gammaInventoryMultiplier: 2,
      minHalfSpreadBps: 1,
      minExpectedEvBps: 0,
      toxicityHardStop: 0.9,
      markoutWindowMs: 500
    },
    grid: {
      enabled: false,
      spacingMode: "VOLATILITY",
      fixedSpacingBps: 4,
      maxLevels: 5,
      positionThresholdUsdt: 20
    },
    crossVenue: {
      enabled: false,
      makerVenue: "TOOBIT",
      hedgeVenue: "BITGET",
      minNetSpreadBps: 2,
      fillTimeoutMs: 5000,
      maxHedgeLagMs: 250
    },
    risk: {
      maxDailyLossUsdt: 2,
      maxApiErrorStreak: 3,
      maxMarketAgeMs: 2000,
      maxPrivateWsAgeMs: 2000,
      maxTruthAgeMs: 2000,
      maxCoverageDeficitUsdt: 0
    }
  }
} as const;

describe("shared VNext contracts", () => {
  it("accepts a valid immutable strategy envelope", () => {
    expect(StrategyConfigEnvelopeSchema.parse(validConfig).version).toBe("v18.4.3");
  });

  it("rejects unsafe quote settings", () => {
    const bad = structuredClone(validConfig) as any;
    bad.config.quote.postOnly = false;
    expect(() => StrategyConfigEnvelopeSchema.parse(bad)).toThrow();
  });

  it("rejects inventory limits in unsafe order", () => {
    const bad = structuredClone(validConfig) as any;
    bad.config.inventory.softLimitUsdt = 30;
    bad.config.inventory.hardLimitUsdt = 20;
    expect(() => StrategyConfigEnvelopeSchema.parse(bad)).toThrow();
  });

  it("requires telemetry source age", () => {
    expect(() => VenueTelemetrySchema.parse({
      venue: "TOOBIT",
      runtimeState: "RUNNING"
    })).toThrow();
  });

  it("rejects an alert without durable timestamps and identity", () => {
    expect(() => AlertEventSchema.parse({
      id: "a",
      fingerprint: "x",
      level: "P0"
    })).toThrow();
  });

  it("rejects negative control generations", () => {
    expect(() => ControlCommandSchema.parse({
      protocolVersion: 1,
      commandId: "cmd_1",
      type: "START_VENUE",
      generation: "-1",
      venue: "TOOBIT"
    })).toThrow();
  });

  it("does not define arbitrary place-order control commands", () => {
    expect(() => ControlCommandSchema.parse({
      protocolVersion: 1,
      commandId: "cmd_2",
      type: "PLACE_ORDER",
      generation: "2",
      venue: "TOOBIT"
    })).toThrow();
  });
});
