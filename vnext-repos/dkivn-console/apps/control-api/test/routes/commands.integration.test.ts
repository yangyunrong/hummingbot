import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import pg from "pg";
import { allocateGeneration } from "../../src/control/generation.js";
import { registerRuntimeCommandRoutes } from "../../src/routes/commands.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

beforeEach(async () => {
  await pool.query("TRUNCATE audit_log");
});

afterAll(async () => {
  await pool.end();
});

describe("control generation and runtime commands", () => {
  it("allocates unique monotonic generations under concurrency", async () => {
    const values = await Promise.all(
      Array.from({ length: 20 }, () => allocateGeneration(pool)),
    );
    const nums = values.map(BigInt);
    expect(new Set(values).size).toBe(20);
    const sorted = [...nums].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]! > sorted[i - 1]!).toBe(true);
    }
  });

  it("does not record a rejected engine command as applied", async () => {
    const send = vi.fn().mockResolvedValue({
      protocolVersion: 1,
      commandId: "will-be-replaced",
      ok: false,
      code: "DISPATCH_FAILED",
      appliedGeneration: "0",
    });
    const app = Fastify();
    registerRuntimeCommandRoutes(app, {
      pool,
      engineClient: { send },
      authorize: () => "operator",
      commandId: () => "cmd-fixed",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/runtime/TOOBIT/start",
    });

    expect(response.statusCode).toBe(409);
    const applied = await pool.query(
      "SELECT count(*)::int AS n FROM audit_log WHERE action = 'CONTROL_APPLIED'",
    );
    expect(applied.rows[0].n).toBe(0);
    await app.close();
  });

  it("does not expose arbitrary browser order mutation routes", async () => {
    const app = Fastify();
    registerRuntimeCommandRoutes(app, {
      pool,
      engineClient: { send: vi.fn() },
      authorize: () => "operator",
    });
    const routes = app.printRoutes();
    expect(routes).not.toMatch(/place-order/i);
    expect(routes).not.toMatch(/cancel-order\//i);
    await app.close();
  });
});
