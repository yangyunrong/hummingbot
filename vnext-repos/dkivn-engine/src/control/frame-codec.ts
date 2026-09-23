export const MAX_FRAME_BYTES = 1024 * 1024;

export function encodeFrame(value: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(value), "utf8");
  if (payload.length > MAX_FRAME_BYTES) {
    throw new Error("FRAME_TOO_LARGE");
  }
  const frame = Buffer.allocUnsafe(4 + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
}

export class FrameDecoder {
  private readonly header = Buffer.allocUnsafe(4);
  private headerBytes = 0;
  private payload: Buffer | null = null;
  private payloadBytes = 0;
  private payloadLength = -1;

  push(chunk: Buffer): unknown[] {
    const out: unknown[] = [];
    let offset = 0;

    while (offset < chunk.length) {
      if (this.payload === null) {
        const needed = 4 - this.headerBytes;
        const take = Math.min(needed, chunk.length - offset);
        chunk.copy(this.header, this.headerBytes, offset, offset + take);
        this.headerBytes += take;
        offset += take;

        if (this.headerBytes < 4) {
          continue;
        }

        this.payloadLength = this.header.readUInt32BE(0);
        if (this.payloadLength > MAX_FRAME_BYTES) {
          this.reset();
          throw new Error("FRAME_TOO_LARGE");
        }
        this.payload = Buffer.allocUnsafe(this.payloadLength);
        this.payloadBytes = 0;

        if (this.payloadLength === 0) {
          this.finishPayload(out);
        }
      }

      if (this.payload !== null && offset < chunk.length) {
        const needed = this.payloadLength - this.payloadBytes;
        const take = Math.min(needed, chunk.length - offset);
        if (take > 0) {
          chunk.copy(this.payload, this.payloadBytes, offset, offset + take);
          this.payloadBytes += take;
          offset += take;
        }

        if (this.payloadBytes === this.payloadLength) {
          this.finishPayload(out);
        }
      }
    }

    return out;
  }

  private finishPayload(out: unknown[]): void {
    const payload = this.payload;
    if (payload === null) return;

    try {
      out.push(JSON.parse(payload.toString("utf8")));
    } catch {
      this.reset();
      throw new Error("INVALID_FRAME_JSON");
    }
    this.reset();
  }

  private reset(): void {
    this.headerBytes = 0;
    this.payload = null;
    this.payloadBytes = 0;
    this.payloadLength = -1;
  }
}
