import { describe, expect, it, vi } from "vitest";
import { TelemetryWorker } from "../../src/telemetry/telemetry-worker.js";

describe("TelemetryWorker", () => {
  it("drops telemetry after bounded capacity instead of blocking strategy", () => {
    const sender = vi.fn(async () => undefined);
    const worker = new TelemetryWorker<number>({ capacity: 2, sender });
    expect(worker.publish(1)).toBe(true);
    expect(worker.publish(2)).toBe(true);
    expect(worker.publish(3)).toBe(false);
    expect(worker.metrics.dropped).toBe(1);
  });

  it("keeps a failed batch in the same bounded ring for retry", async () => {
    const sender = vi.fn()
      .mockRejectedValueOnce(new Error("collector down"))
      .mockResolvedValueOnce(undefined);
    const worker = new TelemetryWorker<number>({ capacity: 3, sender, maxBatchSize: 3 });
    worker.publish(10);
    worker.publish(20);

    await expect(worker.flushOnce()).rejects.toThrow("collector down");
    expect(worker.size).toBe(2);

    await worker.flushOnce();
    expect(worker.size).toBe(0);
    expect(sender).toHaveBeenNthCalledWith(1, [10, 20]);
    expect(sender).toHaveBeenNthCalledWith(2, [10, 20]);
  });
});
