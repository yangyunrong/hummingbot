import { describe, expect, it } from "vitest";
import type { StrategyConfigEnvelope } from "@dkivn/contracts";
import { RuntimeConfigStore } from "../../src/config/runtime-config-store.js";
import { applyConfigCommand } from "../../src/config/apply-config-command.js";

function config(generation: string): StrategyConfigEnvelope {
  return {
    id: "cfg_" + generation,
    version: "v" + generation,
    generation,
    createdAt: "2026-09-23T05:00:00.000Z",
    createdBy: "test",
    status: "SHADOW",
    venueScope: ["TOOBIT"],
    symbolScope: ["BTC-SWAP-USDT"],
    checksum: "sha256:" + generation,
    config: {
      strategyMode: "HYBRID_MM",
      quote: {
        baseNotionalUsdt: 10,
        levels: 5,
        maxOrdersPerSymbol: 10,
        minQuoteLifeMs: 2500,
        requoteThresholdBps: 2,
        postOnly: true,
      },
      inventory: {
        targetNetUsdt: 0,
        softLimitUsdt: 10,
        hardLimitUsdt: 20,
        maxGrossUsdt: 40,
      },
      hybridMm: {
        baseGamma: 0.05,
        gammaToxicityMultiplier: 2,
        gammaInventoryMultiplier: 2,
        minHalfSpreadBps: 1,
        minExpectedEvBps: 0,
        toxicityHardStop: 0.9,
        markoutWindowMs: 500,
      },
      grid: {
        enabled: false,
        spacingMode: "VOLATILITY",
        fixedSpacingBps: 4,
        maxLevels: 5,
        positionThresholdUsdt: 20,
      },
      crossVenue: {
        enabled: false,
        makerVenue: "TOOBIT",
        hedgeVenue: "BITGET",
        minNetSpreadBps: 2,
        fillTimeoutMs: 5000,
        maxHedgeLagMs: 250,
      },
      risk: {
        maxDailyLossUsdt: 2,
        maxApiErrorStreak: 3,
        maxMarketAgeMs: 2000,
        maxPrivateWsAgeMs: 2000,
        maxTruthAgeMs: 2000,
        maxCoverageDeficitUsdt: 0,
      },
    },
  };
}

describe("immutable runtime config store", () => {
  it("atomically replaces config only with a newer generation", () => {
    const store = new RuntimeConfigStore(config("100"));
    const before = store.current();
    expect(store.apply(config("101")).ok).toBe(true);
    expect(store.current().generation).toBe("101");
    expect(store.current()).not.toBe(before);
    expect(store.apply(config("100")).code).toBe("STALE_GENERATION");
    expect(store.current().generation).toBe("101");
  });

  it("deep-freezes the applied snapshot", () => {
    const store = new RuntimeConfigStore(config("100"));
    expect(Object.isFrozen(store.current())).toBe(true);
    expect(Object.isFrozen(store.current().config)).toBe(true);
    expect(Object.isFrozen(store.current().config.quote)).toBe(true);
  });

  it("applies config without reconnecting public or private WS", async () => {
    const store = new RuntimeConfigStore(config("100"));
    const connections = {
      publicWsConnectionId: "pub-1",
      privateWsConnectionId: "priv-1",
    };

    const result = await applyConfigCommand({
      protocolVersion: 1,
      commandId: "cfg-cmd",
      type: "APPLY_CONFIG",
      generation: "101",
      config: config("101"),
    }, store, connections);

    expect(result.code).toBe("CONFIG_APPLIED");
    expect(connections.publicWsConnectionId).toBe("pub-1");
    expect(connections.privateWsConnectionId).toBe("priv-1");
    expect(store.current().generation).toBe("101");
  });
});
