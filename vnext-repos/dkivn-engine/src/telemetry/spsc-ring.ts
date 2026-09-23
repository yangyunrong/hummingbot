export class SpscRing<T> {
  private readonly items: Array<T | undefined>;
  private readIndex = 0;
  private writeIndex = 0;
  private count = 0;
  public dropped = 0;

  constructor(public readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error("INVALID_RING_CAPACITY");
    }
    this.items = new Array<T | undefined>(capacity);
  }

  get size(): number {
    return this.count;
  }

  tryPush(value: T): boolean {
    if (this.count === this.capacity) {
      this.dropped += 1;
      return false;
    }
    this.items[this.writeIndex] = value;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    this.count += 1;
    return true;
  }

  tryPop(): T | undefined {
    if (this.count === 0) return undefined;
    const value = this.items[this.readIndex];
    this.items[this.readIndex] = undefined;
    this.readIndex = (this.readIndex + 1) % this.capacity;
    this.count -= 1;
    return value;
  }

  peekBatch(maxItems: number): T[] {
    const take = Math.min(Math.max(0, Math.trunc(maxItems)), this.count);
    const out = new Array<T>(take);
    let index = this.readIndex;
    for (let i = 0; i < take; i += 1) {
      out[i] = this.items[index] as T;
      index = (index + 1) % this.capacity;
    }
    return out;
  }

  drop(count: number): void {
    const take = Math.min(Math.max(0, Math.trunc(count)), this.count);
    for (let i = 0; i < take; i += 1) {
      this.items[this.readIndex] = undefined;
      this.readIndex = (this.readIndex + 1) % this.capacity;
    }
    this.count -= take;
  }
}
