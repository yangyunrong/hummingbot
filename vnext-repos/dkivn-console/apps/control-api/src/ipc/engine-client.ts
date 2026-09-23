import { createConnection, type Socket } from "node:net";
import {
  ControlResponseSchema,
  type ControlCommand,
  type ControlResponse,
} from "@dkivn/contracts";

const MAX_FRAME_BYTES = 1024 * 1024;

function encodeFrame(value: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(value), "utf8");
  if (payload.length > MAX_FRAME_BYTES) throw new Error("FRAME_TOO_LARGE");
  const frame = Buffer.allocUnsafe(payload.length + 4);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
}

export interface EngineClientOptions {
  socketPath: string;
  timeoutMs?: number;
}

export class EngineClient {
  private readonly socketPath: string;
  private readonly timeoutMs: number;

  constructor(options: EngineClientOptions) {
    this.socketPath = options.socketPath;
    this.timeoutMs = options.timeoutMs ?? 500;
  }

  send(command: ControlCommand): Promise<ControlResponse> {
    return new Promise<ControlResponse>((resolve, reject) => {
      let settled = false;
      let buffer = Buffer.alloc(0);
      const socket = createConnection(this.socketPath);

      const finish = (error?: Error, response?: ControlResponse) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        if (error) reject(error);
        else resolve(response!);
      };

      const timer = setTimeout(() => finish(new Error("ENGINE_CONTROL_TIMEOUT")), this.timeoutMs);

      socket.once("error", (error) => finish(error));
      socket.once("connect", () => {
        socket.write(encodeFrame(command));
      });
      socket.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length < 4) return;

        const size = buffer.readUInt32BE(0);
        if (size > MAX_FRAME_BYTES) {
          finish(new Error("FRAME_TOO_LARGE"));
          return;
        }
        if (buffer.length < size + 4) return;

        let decoded: unknown;
        try {
          decoded = JSON.parse(buffer.subarray(4, 4 + size).toString("utf8"));
        } catch {
          finish(new Error("INVALID_ENGINE_RESPONSE_JSON"));
          return;
        }

        const parsed = ControlResponseSchema.safeParse(decoded);
        if (!parsed.success) {
          finish(new Error("INVALID_ENGINE_RESPONSE"));
          return;
        }
        if (parsed.data.commandId !== command.commandId) {
          finish(new Error("COMMAND_ID_MISMATCH"));
          return;
        }
        finish(undefined, parsed.data);
      });
    });
  }
}

export interface EngineCommandClient {
  send(command: ControlCommand): Promise<ControlResponse>;
}
