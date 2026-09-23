import { describe, expect, it } from "vitest";
import { SpscRing } from "../../src/telemetry/spsc-ring.js";

describe("SpscRing", () => {
  it("never grows beyond capacity", () => {
    const ring = new SpscRing<number>(4);
    expect(ring.tryPush(1)).toBe(true);
    expect(ring.tryPush(2)).toBe(true);
    expect(ring.tryPush(3)).toBe(true);
    expect(ring.tryPush(4)).toBe(true);
    expect(ring.tryPush(5)).toBe(false);
    expect(ring.capacity).toBe(4);
    expect(ring.size).toBe(4);
    expect(ring.dropped).toBe(1);
  });

  it("preserves FIFO order", () => {
    const ring = new SpscRing<number>(3);
    ring.tryPush(10);
    ring.tryPush(20);
    expect(ring.tryPop()).toBe(10);
    expect(ring.tryPop()).toBe(20);
  });
});
