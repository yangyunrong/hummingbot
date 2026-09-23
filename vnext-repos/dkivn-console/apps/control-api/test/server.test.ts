import { describe, expect, it, vi } from "vitest";
import { buildServer } from "../src/server.js";

function fakePool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    end: vi.fn().mockResolvedValue(undefined),
  };
}

describe("control API server read-only cutover mode", () => {
  it("serves health without granting control mutation authority", async () => {
    const send = vi.fn();
    const app = buildServer({
      pool: fakePool() as never,
      mutationsEnabled: false,
      engineClient: { send } as never,
      authorize: () => "operator",
    });

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().controlMutationsEnabled).toBe(false);

    const start = await app.inject({ method: "POST", url: "/api/runtime/TOOBIT/start" });
    expect(start.statusCode).toBe(503);
    expect(start.json().code).toBe("CONTROL_MUTATIONS_DISABLED");
    expect(send).not.toHaveBeenCalled();

    const promote = await app.inject({
      method: "POST",
      url: "/api/configs/config-1/promote",
      payload: { targetStatus: "SHADOW" },
    });
    expect(promote.statusCode).toBe(503);
    expect(send).not.toHaveBeenCalled();

    await app.close();
  });
});
