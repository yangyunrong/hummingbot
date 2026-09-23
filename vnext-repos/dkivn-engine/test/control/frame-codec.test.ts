import { describe, expect, it } from "vitest";
import { encodeFrame, FrameDecoder } from "../../src/control/frame-codec.js";

describe("bounded control frame codec", () => {
  it("decodes a fragmented frame", () => {
    const frame = encodeFrame({ commandId: "x", ok: true });
    const d = new FrameDecoder();
    expect(d.push(frame.subarray(0, 3))).toEqual([]);
    expect(d.push(frame.subarray(3))).toEqual([{ commandId: "x", ok: true }]);
  });

  it("decodes coalesced frames", () => {
    const d = new FrameDecoder();
    const chunk = Buffer.concat([encodeFrame({ n: 1 }), encodeFrame({ n: 2 })]);
    expect(d.push(chunk)).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("rejects oversized frames before payload allocation", () => {
    const d = new FrameDecoder();
    const header = Buffer.alloc(4);
    header.writeUInt32BE(1024 * 1024 + 1);
    expect(() => d.push(header)).toThrow(/FRAME_TOO_LARGE/);
  });
});
