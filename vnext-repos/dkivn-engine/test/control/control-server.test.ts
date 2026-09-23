import { describe, expect, it, vi } from "vitest";
import { ControlServer } from "../../src/control/control-server.js";

describe("generation-fenced control server", () => {
  it("rejects generation <= applied generation without dispatch", async () => {
    const dispatch = vi.fn(async () => ({ code: "APPLIED" }));
    const server = new ControlServer({ appliedGeneration: 10n, dispatch });

    const response = await server.handle({
      protocolVersion: 1,
      commandId: "c1",
      type: "START_VENUE",
      generation: "10",
      venue: "TOOBIT"
    });

    expect(response.ok).toBe(false);
    expect(response.code).toBe("STALE_GENERATION");
    expect(response.appliedGeneration).toBe("10");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("advances generation only after a successful dispatch", async () => {
    const dispatch = vi.fn(async () => ({ code: "APPLIED" }));
    const server = new ControlServer({ appliedGeneration: 10n, dispatch });

    const response = await server.handle({
      protocolVersion: 1,
      commandId: "c2",
      type: "START_VENUE",
      generation: "11",
      venue: "TOOBIT"
    });

    expect(response.ok).toBe(true);
    expect(response.appliedGeneration).toBe("11");
    expect(server.appliedGeneration).toBe(11n);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
