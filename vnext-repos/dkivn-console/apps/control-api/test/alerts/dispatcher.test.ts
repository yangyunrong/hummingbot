import { describe, expect, it, vi } from "vitest";
import { dispatchAlert, formatTelegramAlert } from "../../src/alerts/dispatcher.js";

function alert(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: "alert-1",
    fingerprint: "TOOBIT:XRP:COVERAGE",
    level: "P2",
    venue: "TOOBIT",
    symbol: "XRP-SWAP-USDT",
    type: "HIGH_CHURN",
    startedAt: now,
    firstSeenMonoNs: "1000",
    lastSeenAt: now,
    ageMs: 9000,
    rootCauseCode: "CHURN",
    summary: "High churn",
    truthSnapshot: {},
    automaticAction: "NONE",
    resolvedAt: null,
    ...overrides,
  } as const;
}

describe("alert Telegram dispatcher", () => {
  it("does not send non-actionable trading noise while venue is STOPPED", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await dispatchAlert({ alert: alert(), runtimeState: "STOPPED", send });
    expect(send).not.toHaveBeenCalled();
  });

  it("still sends a stopped P0 when exchange truth shows open risk", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await dispatchAlert({
      alert: alert({
        level: "P0",
        type: "POSITION_COVERAGE_DIVERGENCE",
        automaticAction: "HOLD_NEW_ORDERS",
        truthSnapshot: { positionQty: 1, coverageDeficitUsdt: 2 },
      }),
      runtimeState: "STOPPED",
      send,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("escapes Telegram MarkdownV2 payloads and omits raw truth JSON", () => {
    const message = formatTelegramAlert(alert({
      level: "P0",
      summary: "Coverage [danger] _now_",
      automaticAction: "HOLD_NEW_ORDERS",
      truthSnapshot: { apiKey: "SHOULD_NOT_APPEAR" },
    }));
    expect(message).toContain("\\[danger\\]");
    expect(message).toContain("\\_now\\_");
    expect(message).not.toContain("SHOULD_NOT_APPEAR");
    expect(message).not.toContain("apiKey");
  });
});
