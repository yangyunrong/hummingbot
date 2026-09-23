import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EngineClient } from "../../src/ipc/engine-client.js";

let server: Server | undefined;
let dir: string | undefined;

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  if (dir) await rm(dir, { recursive: true, force: true });
  server = undefined;
  dir = undefined;
});

function frame(value: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(value));
  const out = Buffer.alloc(4 + payload.length);
  out.writeUInt32BE(payload.length, 0);
  payload.copy(out, 4);
  return out;
}

describe("EngineClient", () => {
  it("rejects a response with a mismatched commandId", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "dkivn-control-"));
    const socketPath = path.join(dir, "engine.sock");
    server = createServer((socket) => {
      socket.once("data", () => {
        socket.write(frame({
          protocolVersion: 1,
          commandId: "wrong",
          ok: true,
          code: "OK",
          appliedGeneration: "1",
        }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(socketPath, resolve));

    const client = new EngineClient({ socketPath, timeoutMs: 500 });
    await expect(client.send({
      protocolVersion: 1,
      commandId: "expected",
      type: "START_VENUE",
      generation: "1",
      venue: "TOOBIT",
    })).rejects.toThrow(/COMMAND_ID_MISMATCH/);
  });
});
