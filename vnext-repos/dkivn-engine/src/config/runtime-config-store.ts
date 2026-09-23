import {
  StrategyConfigEnvelopeSchema,
  type StrategyConfigEnvelope,
} from "@dkivn/contracts";

export interface ConfigApplyResult {
  ok: boolean;
  code: "CONFIG_APPLIED" | "STALE_GENERATION";
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value as object)) {
      const child = (value as Record<PropertyKey, unknown>)[key];
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function immutableSnapshot(input: StrategyConfigEnvelope): StrategyConfigEnvelope {
  const validated = StrategyConfigEnvelopeSchema.parse(input);
  return deepFreeze(structuredClone(validated));
}

export class RuntimeConfigStore {
  private snapshot: StrategyConfigEnvelope;

  constructor(initial: StrategyConfigEnvelope) {
    this.snapshot = immutableSnapshot(initial);
  }

  current(): StrategyConfigEnvelope {
    return this.snapshot;
  }

  apply(next: StrategyConfigEnvelope): ConfigApplyResult {
    const validated = StrategyConfigEnvelopeSchema.parse(next);
    const currentGeneration = BigInt(this.snapshot.generation);
    const nextGeneration = BigInt(validated.generation);

    if (nextGeneration <= currentGeneration) {
      return { ok: false, code: "STALE_GENERATION" };
    }

    this.snapshot = deepFreeze(structuredClone(validated));
    return { ok: true, code: "CONFIG_APPLIED" };
  }
}
