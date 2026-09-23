import { createServer, type Server, type Socket } from "node:net";
import {
  ControlCommandSchema,
  type ControlCommand,
  type ControlResponse,
} from "@dkivn/contracts";
import { encodeFrame, FrameDecoder } from "./frame-codec.js";

export interface DispatchResult {
  code: string;
  message?: string;
}

export interface ControlServerOptions {
  appliedGeneration?: bigint;
  dispatch: (command: ControlCommand) => Promise<DispatchResult>;
}

export class ControlServer {
  private generation: bigint;
  private readonly dispatch: ControlServerOptions["dispatch"];
  private server: Server | null = null;

  constructor(options: ControlServerOptions) {
    this.generation = options.appliedGeneration ?? 0n;
    this.dispatch = options.dispatch;
  }

  get appliedGeneration(): bigint {
    return this.generation;
  }

  async handle(input: unknown): Promise<ControlResponse> {
    const parsed = ControlCommandSchema.safeParse(input);
    if (!parsed.success) {
      return {
        protocolVersion: 1,
        commandId: this.commandIdFromUnknown(input),
        ok: false,
        code: "INVALID_COMMAND",
        appliedGeneration: this.generation.toString(),
      };
    }

    const command = parsed.data;
    const requestedGeneration = BigInt(command.generation);

    if (requestedGeneration <= this.generation) {
      return {
        protocolVersion: 1,
        commandId: command.commandId,
        ok: false,
        code: "STALE_GENERATION",
        appliedGeneration: this.generation.toString(),
      };
    }

    try {
      const result = await this.dispatch(command);
      this.generation = requestedGeneration;
      return {
        protocolVersion: 1,
        commandId: command.commandId,
        ok: true,
        code: result.code,
        appliedGeneration: this.generation.toString(),
        ...(result.message === undefined ? {} : { message: result.message }),
      };
    } catch (error) {
      return {
        protocolVersion: 1,
        commandId: command.commandId,
        ok: false,
        code: "DISPATCH_FAILED",
        appliedGeneration: this.generation.toString(),
        message: error instanceof Error ? error.message : "unknown dispatch failure",
      };
    }
  }

  async start(socketPath: string): Promise<void> {
    if (this.server !== null) {
      throw new Error("CONTROL_SERVER_ALREADY_STARTED");
    }

    const server = createServer((socket) => this.attachSocket(socket));
    this.server = server;

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        this.server = null;
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(socketPath);
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (server === null) return;
    this.server = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  private attachSocket(socket: Socket): void {
    const decoder = new FrameDecoder();
    let chain = Promise.resolve();

    socket.on("data", (chunk: Buffer) => {
      let frames: unknown[];
      try {
        frames = decoder.push(chunk);
      } catch {
        socket.destroy();
        return;
      }

      for (const frame of frames) {
        chain = chain.then(async () => {
          const response = await this.handle(frame);
          if (!socket.destroyed) socket.write(encodeFrame(response));
        }).catch(() => {
          socket.destroy();
        });
      }
    });
  }

  private commandIdFromUnknown(input: unknown): string {
    if (
      typeof input === "object" &&
      input !== null &&
      "commandId" in input &&
      typeof (input as { commandId?: unknown }).commandId === "string" &&
      (input as { commandId: string }).commandId.length > 0
    ) {
      return (input as { commandId: string }).commandId;
    }
    return "INVALID";
  }
}
