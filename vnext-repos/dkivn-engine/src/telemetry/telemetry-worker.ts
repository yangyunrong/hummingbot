import { SpscRing } from "./spsc-ring.js";

export interface TelemetryWorkerOptions<T> {
  capacity: number;
  sender: (batch: T[]) => Promise<void>;
  maxBatchSize?: number;
  flushIntervalMs?: number;
  onDegraded?: (error: unknown) => void;
}

export class TelemetryWorker<T> {
  private readonly ring: SpscRing<T>;
  private readonly sender: (batch: T[]) => Promise<void>;
  private readonly maxBatchSize: number;
  private readonly flushIntervalMs: number;
  private readonly onDegraded?: (error: unknown) => void;
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;

  public readonly metrics = {
    dropped: 0,
    sendFailures: 0,
  };

  constructor(options: TelemetryWorkerOptions<T>) {
    this.ring = new SpscRing<T>(options.capacity);
    this.sender = options.sender;
    this.maxBatchSize = options.maxBatchSize ?? 256;
    this.flushIntervalMs = options.flushIntervalMs ?? 50;
    this.onDegraded = options.onDegraded;
  }

  get size(): number {
    return this.ring.size;
  }

  publish(event: T): boolean {
    const accepted = this.ring.tryPush(event);
    if (!accepted) this.metrics.dropped += 1;
    return accepted;
  }

  async flushOnce(): Promise<void> {
    if (this.flushing || this.ring.size === 0) return;
    this.flushing = true;
    const batch = this.ring.peekBatch(this.maxBatchSize);
    try {
      await this.sender(batch);
      this.ring.drop(batch.length);
    } catch (error) {
      this.metrics.sendFailures += 1;
      this.onDegraded?.(error);
      throw error;
    } finally {
      this.flushing = false;
    }
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.flushOnce().catch(() => {
        // Failure is counted and signaled through onDegraded.
        // Items remain in the same bounded ring for the next attempt.
      });
    }, this.flushIntervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
